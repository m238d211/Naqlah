import * as Ably from "ably";

const base = import.meta.env.VITE_API_BASE_URL || "http://localhost:8787";

export function connectRealtime(
  pairingId: string,
  onEvent: () => void,
  onError: () => void,
): () => void {
  let stopped = false;
  const client = new Ably.Realtime({
    authCallback: async (_params, callback) => {
      try {
        const response = await fetch(`${base}/api/v1/realtime/token?pairingId=${encodeURIComponent(pairingId)}`, {
          headers: { Authorization: `Bearer ${sessionStorage.getItem("naqlah_app_token") || ""}` },
        });
        const body = await response.json() as { ok: boolean; data?: Ably.TokenDetails; error?: { message: string } };
        if (!response.ok || !body.ok || !body.data) throw new Error(body.error?.message || "realtime_auth_failed");
        callback(null, body.data);
      } catch (error) {
        callback(error instanceof Error ? error.message : "realtime_auth_failed", null);
        onError();
      }
    },
  });
  const channel = client.channels.get(`naqlah:pairing:${pairingId}`);
  void channel.subscribe(() => {
    if (!stopped) onEvent();
  }).catch(() => onError());
  return () => {
    stopped = true;
    channel.unsubscribe();
    client.close();
  };
}
