import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { AppEnv } from "@naqlah/config";
export const randomId = () => randomBytes(24).toString("base64url");
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generatePairingCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++)
    s += alphabet[randomBytes(1)[0]! % alphabet.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}
export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
export function verifyHash(value: string, expected: string): boolean {
  const a = Buffer.from(hashSecret(value));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
const encoder = new TextEncoder();
export async function signAppToken(
  payload: Record<string, unknown>,
  env: AppEnv,
  expiresIn = "15m",
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(encoder.encode(env.JWT_SECRET));
}
export async function verifyAppToken(
  token: string,
  env: AppEnv,
): Promise<Record<string, unknown>> {
  const { payload } = await jwtVerify(token, encoder.encode(env.JWT_SECRET));
  return payload as Record<string, unknown>;
}
export async function verifyExchangeToken(
  token: string,
  env: AppEnv,
): Promise<{ id: string; email: string; name: string }> {
  const { payload } = await jwtVerify(
    token,
    encoder.encode(env.SUPERAPP_SHARED_SECRET),
    { audience: env.MINI_APP_ID },
  );
  if (
    payload.typ !== "mini_app_sso" ||
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string"
  )
    throw new Error("invalid_sso");
  return {
    id: payload.id?.toString() ?? payload.sub,
    email: payload.email,
    name: payload.name?.toString() || payload.email,
  };
}
export function signedQrPayload(
  sessionId: string,
  nonce: string,
  secret: string,
): string {
  return `${sessionId}.${nonce}.${hashSecret(`${sessionId}.${nonce}.${secret}`)}`;
}
export function parseQrPayload(
  value: string,
  secret: string,
): { sessionId: string; nonce: string } {
  const [sessionId, nonce, signature] = value.split(".");
  if (
    !sessionId ||
    !nonce ||
    !signature ||
    signature !== hashSecret(`${sessionId}.${nonce}.${secret}`)
  )
    throw new Error("invalid_qr");
  return { sessionId, nonce };
}
