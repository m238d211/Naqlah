import type {
  ApiResponse,
  PairingStatusView,
  TransferView,
  AppSession,
} from "@naqlah/shared-types";
const base = import.meta.env.VITE_API_BASE_URL || "http://localhost:8787";
const token = () => sessionStorage.getItem("naqlah_app_token") || "";
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}`, ...(init.headers || {}) },
    });
  } finally {
    window.clearTimeout(timeout);
  }
  const body = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !body.ok)
    throw new Error(body.ok ? "تعذر تنفيذ الطلب" : body.error.message);
  return body.data;
}
export const exchange = (exchangeToken: string) =>
  request<AppSession>("/api/v1/auth/exchange-token", {
    method: "POST",
    body: JSON.stringify({ exchangeToken }),
  }).then((x) => {
    sessionStorage.setItem("naqlah_app_token", x.accessToken);
    return x;
  });
export const claimManual = (code: string) =>
  request<PairingStatusView>("/api/v1/pairing/claim/manual", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
export const claimQr = (value: string) => {
  const [sessionId, nonce, signature] = value.split(".");
  return request<PairingStatusView>("/api/v1/pairing/claim/qr", {
    method: "POST",
    body: JSON.stringify({ sessionId, nonce, signature }),
  });
};
export const pairing = (id: string) =>
  request<PairingStatusView>(`/api/v1/pairing/${id}`);
export const confirm = (id: string) =>
  request(`/api/v1/pairing/${id}/confirm`, { method: "POST" });
export const reject = (id: string) =>
  request(`/api/v1/pairing/${id}/reject`, { method: "POST" });
export const listTransfers = (id: string) =>
  request<TransferView[]>(`/api/v1/pairing/${id}/transfers`);
