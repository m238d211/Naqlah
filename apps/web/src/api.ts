import type {
  ApiResponse,
  PairingSessionView,
  PairingStatusView,
  TransferView,
} from "@naqlah/shared-types";
const base = import.meta.env.VITE_API_BASE_URL || "http://localhost:8787";
const token = () => sessionStorage.getItem("naqlah_device_token") || "";
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Naqlah-Device-Token": token(),
      ...(init.headers || {}),
    },
  });
  const body = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !body.ok)
    throw new Error(body.ok ? "تعذر تنفيذ الطلب" : body.error.message);
  return body.data;
}
export const createPairing = () =>
  request<PairingSessionView & { deviceToken: string }>("/api/v1/pairing", {
    method: "POST",
  }).then((x) => {
    sessionStorage.setItem("naqlah_device_token", x.deviceToken);
    return x;
  });
export const getPairing = (id: string) =>
  request<PairingStatusView>(`/api/v1/pairing/${id}`);
export const regenerate = (id: string) =>
  request<{ manualCode: string; expiresAt: string }>(
    `/api/v1/pairing/${id}/regenerate`,
    { method: "POST" },
  );
export const closePairing = (id: string) =>
  request(`/api/v1/pairing/${id}/close`, { method: "POST" });
export const transfers = (id: string) =>
  request<TransferView[]>(`/api/v1/pairing/${id}/transfers`);
export const sendText = (id: string, text: string) =>
  request<TransferView>(`/api/v1/pairing/${id}/transfers/text`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
export const sendUrl = (id: string, url: string) =>
  request<TransferView>(`/api/v1/pairing/${id}/transfers/url`, {
    method: "POST",
    body: JSON.stringify({ url }),
  });
export const authorizeUpload = (id: string, metadata: object) =>
  request<{ transferId: string; uploadUrl: string | null }>(
    `/api/v1/pairing/${id}/uploads/authorize`,
    { method: "POST", body: JSON.stringify(metadata) },
  );
