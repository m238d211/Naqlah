import { Hono } from "hono";
import { cors } from "hono/cors";
import { getCookie, setCookie } from "hono/cookie";
import { loadEnv, type AppEnv } from "@naqlah/config";
import {
  exchangeTokenSchema,
  manualClaimSchema,
  qrClaimSchema,
  textTransferSchema,
  uploadMetadataSchema,
  urlTransferSchema,
} from "@naqlah/validation";
import type {
  ApiResponse,
  DeviceInfo,
  PairingSessionView,
  PairingStatusView,
  TransferView,
} from "@naqlah/shared-types";
import {
  generatePairingCode,
  hashSecret,
  parseQrPayload,
  randomId,
  signAppToken,
  signedQrPayload,
  verifyAppToken,
  verifyExchangeToken,
  verifyHash,
} from "./security.js";
import { MemoryStore, type Pairing, type Transfer } from "./store.js";

export interface AppContext {
  env: AppEnv;
  store: MemoryStore;
}
const json = <T>(data: T): ApiResponse<T> => ({ ok: true, data });
const error = (c: string, m: string, status = 400) => ({
  body: { ok: false, error: { code: c, message: m } } as const,
  status,
});
const now = () => new Date();
function deviceFromHeader(kind: "web" | "mini-app", h: Headers): DeviceInfo {
  return {
    kind,
    browser: h.get("x-naqlah-browser") ?? undefined,
    operatingSystem: h.get("x-naqlah-os") ?? undefined,
    createdAt: now().toISOString(),
  };
}
function viewPairing(p: Pairing, includeCode = false): PairingSessionView {
  return {
    id: p.id,
    qrPayload: p.qrPayload,
    manualCode: includeCode
      ? ((p as Pairing & { manualCode?: string }).manualCode ?? "")
      : "",
    expiresAt: p.expiresAt.toISOString(),
    status: p.status,
    device: p.device,
  };
}
function viewTransfer(t: Transfer): TransferView {
  return {
    ...t,
    createdAt: t.createdAt.toISOString(),
    expiresAt: t.expiresAt.toISOString(),
  };
}

export function createApp(
  context: AppContext = { env: loadEnv(), store: new MemoryStore() },
): Hono {
  const app = new Hono();
  const { env, store } = context;
  const origins = new Set(
    env.ALLOWED_ORIGINS.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  app.use(
    "*",
    cors({
      origin: (origin) => (origin && origins.has(origin) ? origin : undefined),
      allowHeaders: ["Content-Type", "Authorization", "X-Naqlah-Device-Token"],
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    }),
  );
  app.use("*", async (c, next) => {
    try {
      await next();
    } catch (e) {
      console.error(
        JSON.stringify({
          event: "request_error",
          message: e instanceof Error ? e.message : "unknown",
        }),
      );
      return c.json(
        error("INTERNAL_ERROR", "حدث خطأ غير متوقع", 500).body,
        500,
      );
    }
  });
  const auth = async (c: any) => {
    const token =
      c.req.header("Authorization")?.replace(/^Bearer\s+/i, "") ??
      c.req.header("X-Naqlah-Device-Token");
    if (!token) return null;
    try {
      return await verifyAppToken(token, env);
    } catch {
      return null;
    }
  };
  const pairingFor = (id: string) => {
    const p = store.pairings.get(id);
    if (!p || p.expiresAt <= now()) {
      if (p) p.status = "expired";
      return null;
    }
    return p;
  };
  app.get("/api/v1/health", (c) =>
    c.json(json({ status: "ok", service: "naqlah-api" })),
  );
  app.post("/api/v1/auth/exchange-token", async (c) => {
    const parsed = exchangeTokenSchema.safeParse(
      await c.req.json().catch(() => ({})),
    );
    if (!parsed.success)
      return c.json(
        error("INVALID_REQUEST", "بيانات الدخول غير صالحة").body,
        400,
      );
    try {
      const user = await verifyExchangeToken(parsed.data.exchangeToken, env);
      let record = store.users.get(user.id);
      if (!record) {
        record = { ...user, createdAt: now() };
        store.users.set(user.id, record);
      }
      const accessToken = await signAppToken(
        { sub: user.id, kind: "mini-app", email: user.email, name: user.name },
        env,
      );
      return c.json(
        json({
          accessToken,
          expiresAt: new Date(Date.now() + 900000).toISOString(),
          user: { id: user.id, name: user.name, email: user.email },
        }),
      );
    } catch {
      return c.json(
        error("SSO_REJECTED", "تعذر التحقق من جلسة Super Badi", 401).body,
        401,
      );
    }
  });
  app.post("/api/v1/pairing", async (c) => {
    const device = deviceFromHeader("web", c.req.raw.headers);
    const id = randomId(),
      nonce = randomId(),
      code = generatePairingCode(),
      p: Pairing = {
        id,
        codeHash: hashSecret(code),
        qrPayload: signedQrPayload(id, nonce, env.PAIRING_TOKEN_SECRET),
        nonce,
        device,
        status: "pending",
        attempts: 0,
        expiresAt: new Date(Date.now() + env.PAIRING_CODE_TTL_SECONDS * 1000),
        createdAt: now(),
        used: false,
      };
    (p as Pairing & { manualCode?: string }).manualCode = code;
    store.pairings.set(id, p);
    const token = await signAppToken(
      { sub: id, kind: "web", pairingId: id },
      env,
      "30m",
    );
    store.sessions.set(hashSecret(token), {
      tokenHash: hashSecret(token),
      pairingId: id,
      kind: "web",
      expiresAt: new Date(Date.now() + 1800000),
    });
    return c.json(json({ ...viewPairing(p, true), deviceToken: token }));
  });
  app.post("/api/v1/pairing/:id/regenerate", async (c) => {
    const p = pairingFor(c.req.param("id"));
    if (!p || p.status !== "pending")
      return c.json(
        error("PAIRING_UNAVAILABLE", "جلسة الاقتران غير متاحة", 410).body,
        410,
      );
    const code = generatePairingCode();
    p.codeHash = hashSecret(code);
    p.attempts = 0;
    p.expiresAt = new Date(Date.now() + env.PAIRING_CODE_TTL_SECONDS * 1000);
    p.used = false;
    (p as Pairing & { manualCode?: string }).manualCode = code;
    return c.json(
      json({ manualCode: code, expiresAt: p.expiresAt.toISOString() }),
    );
  });
  const claim = async (c: any, mode: "qr" | "manual") => {
    const claims = await auth(c);
    if (!claims || claims.kind !== "mini-app")
      return c.json(
        error("UNAUTHORIZED", "يلزم تسجيل الدخول من Mini App", 401).body,
        401,
      );
    let target: Pairing | null = null;
    if (mode === "manual") {
      const parsed = manualClaimSchema.safeParse(
        await c.req.json().catch(() => ({})),
      );
      if (!parsed.success)
        return c.json(error("INVALID_CODE", "رمز الاقتران غير صالح").body, 400);
      const code = parsed.data.code;
      const found = [...store.pairings.values()].find(
        (x) =>
          x.status === "pending" &&
          x.expiresAt > now() &&
          verifyHash(code, x.codeHash),
      );
      if (!found) {
        const candidates = [...store.pairings.values()].filter(
          (x) => x.status === "pending",
        );
        for (const x of candidates) x.attempts++;
        return c.json(
          error("INVALID_CODE", "رمز الاقتران غير صالح أو منتهي", 404).body,
          404,
        );
      }
      target = found;
    }
    if (
      !target ||
      target.status !== "pending" ||
      target.used ||
      target.attempts >= 5
    )
      return c.json(
        error("PAIRING_UNAVAILABLE", "جلسة الاقتران غير متاحة", 410).body,
        410,
      );
    target.status = "claimed";
    target.userId = String(claims.sub);
    target.userName = String(claims.name ?? claims.email);
    target.used = true;
    return c.json(
      json({
        id: target.id,
        status: target.status,
        device: target.device,
        expiresAt: target.expiresAt.toISOString(),
      } as PairingStatusView),
    );
  };
  app.post("/api/v1/pairing/claim/manual", (c) => claim(c, "manual"));
  app.post("/api/v1/pairing/claim/qr", async (c) => {
    const claims = await auth(c);
    if (!claims || claims.kind !== "mini-app")
      return c.json(
        error("UNAUTHORIZED", "يلزم تسجيل الدخول من Mini App", 401).body,
        401,
      );
    const body = await c.req.json().catch(() => ({}));
    const parsed = qrClaimSchema.safeParse(body);
    if (!parsed.success)
      return c.json(error("INVALID_QR", "رمز QR غير صالح").body, 400);
    let q: { sessionId: string; nonce: string };
    try {
      q = parseQrPayload(
        `${parsed.data.sessionId}.${parsed.data.nonce}.${parsed.data.signature}`,
        env.PAIRING_TOKEN_SECRET,
      );
    } catch {
      return c.json(error("INVALID_QR", "رمز QR غير صالح").body, 400);
    }
    const p = pairingFor(q.sessionId);
    if (!p || p.nonce !== q.nonce || p.status !== "pending")
      return c.json(
        error("PAIRING_UNAVAILABLE", "جلسة الاقتران غير متاحة", 410).body,
        410,
      );
    p.status = "claimed";
    p.userId = String(claims.sub);
    p.userName = String(claims.name ?? claims.email);
    p.used = true;
    return c.json(
      json({
        id: p.id,
        status: p.status,
        device: p.device,
        expiresAt: p.expiresAt.toISOString(),
      } as PairingStatusView),
    );
  });
  app.get("/api/v1/pairing/:id", async (c) => {
    const p = pairingFor(c.req.param("id"));
    if (!p)
      return c.json(
        error("PAIRING_EXPIRED", "انتهت جلسة الاقتران", 410).body,
        410,
      );
    return c.json(
      json({
        id: p.id,
        status: p.status,
        expiresAt: p.expiresAt.toISOString(),
        userName: p.userName,
        device: p.device,
      } as PairingStatusView),
    );
  });
  app.post("/api/v1/pairing/:id/confirm", async (c) => {
    const claims = await auth(c);
    const p = pairingFor(c.req.param("id"));
    if (
      !claims ||
      !p ||
      p.userId !== String(claims.sub) ||
      p.status !== "claimed"
    )
      return c.json(
        error("FORBIDDEN", "لا يمكن تأكيد هذه الجلسة", 403).body,
        403,
      );
    p.status = "active";
    return c.json(json({ status: p.status }));
  });
  app.post("/api/v1/pairing/:id/reject", async (c) => {
    const claims = await auth(c);
    const p = pairingFor(c.req.param("id"));
    if (
      !claims ||
      !p ||
      p.userId !== String(claims.sub) ||
      p.status !== "claimed"
    )
      return c.json(
        error("FORBIDDEN", "لا يمكن رفض هذه الجلسة", 403).body,
        403,
      );
    p.status = "rejected";
    return c.json(json({ status: p.status }));
  });
  app.post("/api/v1/pairing/:id/close", async (c) => {
    const claims = await auth(c);
    const p = pairingFor(c.req.param("id"));
    if (
      !claims ||
      !p ||
      (p.userId !== String(claims.sub) && claims.kind !== "web")
    )
      return c.json(
        error("FORBIDDEN", "لا يمكن إغلاق هذه الجلسة", 403).body,
        403,
      );
    p.status = "closed";
    return c.json(json({ status: p.status }));
  });
  const activePairing = async (c: any) => {
    const claims = await auth(c);
    const p = pairingFor(c.req.param("id"));
    if (
      !claims ||
      !p ||
      p.status !== "active" ||
      (claims.kind === "mini-app" && p.userId !== String(claims.sub)) ||
      (claims.kind === "web" && claims.pairingId !== p.id)
    )
      return null;
    return { claims, p };
  };
  app.post("/api/v1/pairing/:id/transfers/text", async (c) => {
    const ctx = await activePairing(c);
    const body = textTransferSchema.safeParse(
      await c.req.json().catch(() => ({})),
    );
    if (!ctx || !body.success)
      return c.json(
        error(
          ctx ? "INVALID_TEXT" : "FORBIDDEN",
          "لا يمكن إرسال النص",
          ctx ? 400 : 403,
        ).body,
        ctx ? 400 : 403,
      );
    const sender = ctx.claims.kind as "web" | "mini-app",
      t: Transfer = {
        id: randomId(),
        pairingId: ctx.p.id,
        sender,
        receiver: sender === "web" ? "mini-app" : "web",
        contentType: "text",
        text: body.data.text,
        status: "ready",
        createdAt: now(),
        expiresAt: new Date(Date.now() + env.TRANSFER_TTL_SECONDS * 1000),
      };
    store.transfers.set(t.id, t);
    return c.json(json(viewTransfer(t)));
  });
  app.post("/api/v1/pairing/:id/transfers/url", async (c) => {
    const ctx = await activePairing(c);
    const body = urlTransferSchema.safeParse(
      await c.req.json().catch(() => ({})),
    );
    if (!ctx || !body.success)
      return c.json(
        error(
          ctx ? "INVALID_URL" : "FORBIDDEN",
          "لا يمكن إرسال الرابط",
          ctx ? 400 : 403,
        ).body,
        ctx ? 400 : 403,
      );
    const sender = ctx.claims.kind as "web" | "mini-app",
      t: Transfer = {
        id: randomId(),
        pairingId: ctx.p.id,
        sender,
        receiver: sender === "web" ? "mini-app" : "web",
        contentType: "url",
        url: body.data.url,
        status: "ready",
        createdAt: now(),
        expiresAt: new Date(Date.now() + env.TRANSFER_TTL_SECONDS * 1000),
      };
    store.transfers.set(t.id, t);
    return c.json(json(viewTransfer(t)));
  });
  app.post("/api/v1/pairing/:id/uploads/authorize", async (c) => {
    const ctx = await activePairing(c);
    const body = uploadMetadataSchema.safeParse(
      await c.req.json().catch(() => ({})),
    );
    if (!ctx || !body.success)
      return c.json(
        error(
          ctx ? "INVALID_FILE" : "FORBIDDEN",
          "لا يمكن تجهيز رفع الملف",
          ctx ? 400 : 403,
        ).body,
        ctx ? 400 : 403,
      );
    const transferId = randomId(),
      sender = ctx.claims.kind as "web" | "mini-app",
      t: Transfer = {
        id: transferId,
        pairingId: ctx.p.id,
        sender,
        receiver: sender === "web" ? "mini-app" : "web",
        contentType: "file",
        filename: body.data.filename,
        displayFilename: body.data.filename
          .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
          .slice(0, 120),
        mimeType: body.data.mimeType,
        size: body.data.size,
        status: "uploading",
        createdAt: now(),
        expiresAt: new Date(Date.now() + env.TRANSFER_TTL_SECONDS * 1000),
        blobPath: `transfers/${ctx.p.id}/${transferId}`,
      };
    store.transfers.set(transferId, t);
    return c.json(
      json({
        transferId,
        uploadUrl: env.BLOB_READ_WRITE_TOKEN
          ? "issued-by-vercel-blob-adapter"
          : null,
        blobPath: t.blobPath,
      }),
    );
  });
  app.post("/api/v1/transfers/:id/complete", async (c) => {
    const claims = await auth(c),
      t = store.transfers.get(c.req.param("id"));
    if (
      !claims ||
      !t ||
      t.pairingId !== String(claims.pairingId) ||
      t.status !== "uploading"
    )
      return c.json(
        error("FORBIDDEN", "لا يمكن تأكيد هذا الرفع", 403).body,
        403,
      );
    t.status = "ready";
    return c.json(json(viewTransfer(t)));
  });
  app.get("/api/v1/pairing/:id/transfers", async (c) => {
    if (!(await activePairing(c)))
      return c.json(error("FORBIDDEN", "الجلسة غير فعالة", 403).body, 403);
    return c.json(
      json(
        [...store.transfers.values()]
          .filter(
            (t) => t.pairingId === c.req.param("id") && t.status !== "deleted",
          )
          .map(viewTransfer),
      ),
    );
  });
  app.post("/api/v1/transfers/:id/download", async (c) => {
    const claims = await auth(c),
      t = store.transfers.get(c.req.param("id"));
    if (!claims || !t || t.status !== "ready" || t.receiver !== claims.kind)
      return c.json(
        error("FORBIDDEN", "لا يمكن تنزيل هذا العنصر", 403).body,
        403,
      );
    return c.json(
      json({
        downloadUrl:
          t.contentType === "file" && env.BLOB_READ_WRITE_TOKEN
            ? "issued-by-vercel-blob-adapter"
            : null,
        transfer: viewTransfer(t),
      }),
    );
  });
  app.post("/api/v1/transfers/:id/downloaded", async (c) => {
    const claims = await auth(c),
      t = store.transfers.get(c.req.param("id"));
    if (!claims || !t || t.receiver !== claims.kind)
      return c.json(
        error("FORBIDDEN", "لا يمكن تحديث هذا العنصر", 403).body,
        403,
      );
    t.status = "downloaded";
    t.downloadedAt = now();
    return c.json(json({ status: t.status }));
  });
  app.delete("/api/v1/transfers/:id", async (c) => {
    const claims = await auth(c),
      t = store.transfers.get(c.req.param("id"));
    if (!claims || !t || t.pairingId !== String(claims.pairingId))
      return c.json(
        error("FORBIDDEN", "لا يمكن حذف هذا العنصر", 403).body,
        403,
      );
    t.status = "deleted";
    t.deletedAt = now();
    return c.json(json({ status: t.status }));
  });
  app.post("/api/v1/cleanup", async (c) => {
    if (c.req.header("X-Cron-Secret") !== env.CRON_SECRET)
      return c.json(error("UNAUTHORIZED", "غير مصرح", 401).body, 401);
    let expired = 0;
    for (const p of store.pairings.values())
      if (p.expiresAt <= now() && p.status !== "closed") {
        p.status = "expired";
        expired++;
      }
    for (const t of store.transfers.values())
      if (t.expiresAt <= now() && t.status !== "deleted") {
        t.status = "expired";
        expired++;
      }
    return c.json(json({ expired }));
  });
  app.notFound((c) =>
    c.json(error("NOT_FOUND", "المسار غير موجود", 404).body, 404),
  );
  return app;
}
