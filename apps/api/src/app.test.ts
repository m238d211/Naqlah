import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app.js";
import { MemoryStore } from "./store.js";
import { hashSecret, signAppToken } from "./security.js";
import { loadEnv } from "@naqlah/config";

describe("API boundaries", () => {
  it("creates an expiring pairing session with a one-time code", async () => {
    const app = createApp({ env: loadEnv({ NODE_ENV: "test", ALLOWED_ORIGINS: "http://localhost:5173" }), store: new MemoryStore() });
    const response = await app.request("/api/v1/pairing", { method: "POST", headers: { Origin: "http://localhost:5173" } });
    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.ok, true);
    assert.match(body.data.manualCode, /^[A-Z2-9-]+$/);
  });

  it("keeps an approved pairing alive beyond the code TTL for transfers", async () => {
    const store = new MemoryStore();
    const env = loadEnv({ NODE_ENV: "test", ALLOWED_ORIGINS: "http://localhost:5173", PAIRING_CODE_TTL_SECONDS: "1", ACTIVE_PAIRING_TTL_SECONDS: "3600" });
    const app = createApp({ env, store });
    const webResponse = await app.request("/api/v1/pairing", { method: "POST" });
    const webBody = await webResponse.json() as any;
    const miniToken = await signAppToken({ sub: "user-1", kind: "mini-app", email: "test@example.com", name: "Test" }, env, "1h");
    await store.setSession({ tokenHash: hashSecret(miniToken), pairingId: "", kind: "mini-app", userId: "user-1", expiresAt: new Date(Date.now() + 3_600_000) });
    const claim = await app.request("/api/v1/pairing/claim/manual", { method: "POST", headers: { Authorization: `Bearer ${miniToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ code: webBody.data.manualCode }) });
    assert.equal(claim.status, 200);
    const confirm = await app.request(`/api/v1/pairing/${webBody.data.id}/confirm`, { method: "POST", headers: { Authorization: `Bearer ${miniToken}` } });
    assert.equal(confirm.status, 200);
    const status = await app.request(`/api/v1/pairing/${webBody.data.id}`, { headers: { "X-Naqlah-Device-Token": webBody.data.deviceToken } });
    const statusBody = await status.json() as any;
    assert.equal(statusBody.data.status, "active");
    assert.ok(new Date(statusBody.data.expiresAt).getTime() > Date.now() + 3_500_000);
    const transfer = await app.request(`/api/v1/pairing/${webBody.data.id}/transfers/text`, { method: "POST", headers: { "X-Naqlah-Device-Token": webBody.data.deviceToken, "Content-Type": "application/json" }, body: JSON.stringify({ text: "hello" }) });
    assert.equal(transfer.status, 200);
    assert.equal((await transfer.json() as any).data.status, "ready");
  });

  it("rejects cron without secret", async () => {
    const app = createApp({ env: loadEnv({ NODE_ENV: "test" }), store: new MemoryStore() });
    const response = await app.request("/api/v1/cleanup", { method: "POST" });
    assert.equal(response.status, 401);
  });
});
