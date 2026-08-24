import * as Ably from "ably";
import type { AppEnv } from "@naqlah/config";

export type RealtimeEventName =
  | "pairing.claimed"
  | "pairing.active"
  | "pairing.rejected"
  | "pairing.expired"
  | "pairing.closed"
  | "transfer.created"
  | "transfer.ready"
  | "transfer.downloaded"
  | "transfer.deleted";

export function channelName(env: AppEnv, pairingId: string): string {
  return `${env.ABLY_CHANNEL_PREFIX}:pairing:${pairingId}`;
}

export function createRealtimePublisher(env: AppEnv) {
  const client = env.ABLY_API_KEY ? new Ably.Rest(env.ABLY_API_KEY) : null;

  return {
    enabled: client !== null,
    async publish(
      pairingId: string,
      name: RealtimeEventName,
      data: Record<string, unknown> = {},
    ): Promise<void> {
      if (!client) return;
      await client.channels
        .get(channelName(env, pairingId))
        .publish(name, { ...data, pairingId });
    },
    async issueToken(
      pairingId: string,
      clientId: string,
    ): Promise<Ably.TokenDetails> {
      if (!client) throw new Error("ably_not_configured");
      return client.auth.requestToken({
        clientId,
        ttl: 60 * 60 * 1000,
        capability: {
          [channelName(env, pairingId)]: ["subscribe"],
        },
      });
    },
  };
}
