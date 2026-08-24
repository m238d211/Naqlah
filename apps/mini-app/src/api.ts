import type { ApiResponse, AppSession, PairingStatusView, TransferView } from "@naqlah/shared-types";

const base = import.meta.env.VITE_API_BASE_URL || "http://localhost:8787";
const token = () => sessionStorage.getItem("naqlah_app_token") || "";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${base}${path}`, { ...init, signal: controller.signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}`, ...(init.headers || {}) } });
    const body = (await response.json()) as ApiResponse<T>;
    if (!response.ok || !body.ok) throw new Error(body.ok ? "تعذر تنفيذ الطلب" : body.error.message);
    return body.data;
  } finally { window.clearTimeout(timeout); }
}

export const exchange = (exchangeToken: string) => request<AppSession>("/api/v1/auth/exchange-token", { method: "POST", body: JSON.stringify({ exchangeToken }) }).then((session) => {
  sessionStorage.setItem("naqlah_app_token", session.accessToken);
  sessionStorage.setItem("naqlah_app_session", JSON.stringify(session));
  return session;
});

export const readStoredSession = (): AppSession | null => {
  try {
    const value = sessionStorage.getItem("naqlah_app_session");
    if (!value) return null;
    const session = JSON.parse(value) as AppSession;
    if (!session.accessToken || new Date(session.expiresAt).getTime() <= Date.now()) throw new Error("expired");
    return session;
  } catch { sessionStorage.removeItem("naqlah_app_session"); sessionStorage.removeItem("naqlah_app_token"); return null; }
};

export const claimManual = (code: string) => request<PairingStatusView>("/api/v1/pairing/claim/manual", { method: "POST", body: JSON.stringify({ code }) });
export const claimQr = (value: string) => {
  const parts = value.trim().split(".");
  if (parts.length !== 3) throw new Error("رمز QR غير صالح");
  const [sessionId, nonce, signature] = parts;
  return request<PairingStatusView>("/api/v1/pairing/claim/qr", { method: "POST", body: JSON.stringify({ sessionId, nonce, signature }) });
};
export const pairing = (id: string) => request<PairingStatusView>(`/api/v1/pairing/${id}`);
export const confirm = (id: string) => request<{ status: PairingStatusView["status"] }>(`/api/v1/pairing/${id}/confirm`, { method: "POST" });
export const reject = (id: string) => request<{ status: PairingStatusView["status"] }>(`/api/v1/pairing/${id}/reject`, { method: "POST" });
export const close = (id: string) => request<{ status: PairingStatusView["status"] }>(`/api/v1/pairing/${id}/close`, { method: "POST" });
export const listTransfers = (id: string) => request<TransferView[]>(`/api/v1/pairing/${id}/transfers`);
export const sendText = (id: string, text: string) => request<TransferView>(`/api/v1/pairing/${id}/transfers/text`, { method: "POST", body: JSON.stringify({ text }) });
export const sendUrl = (id: string, url: string) => request<TransferView>(`/api/v1/pairing/${id}/transfers/url`, { method: "POST", body: JSON.stringify({ url }) });
export const authorizeUpload = (id: string, metadata: object) => request<{ transferId: string; uploadUrl: string | null }>(`/api/v1/pairing/${id}/uploads/authorize`, { method: "POST", body: JSON.stringify(metadata) });
export const completeUpload = (id: string) => request<TransferView>(`/api/v1/transfers/${id}/complete`, { method: "POST" });
export const requestDownload = (id: string) => request<{ downloadUrl: string | null; transfer: TransferView }>(`/api/v1/transfers/${id}/download`, { method: "POST" });
export const confirmDownloaded = (id: string) => request<{ status: TransferView["status"] }>(`/api/v1/transfers/${id}/downloaded`, { method: "POST" });
