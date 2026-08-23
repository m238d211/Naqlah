import type {
  ContentType,
  DeviceInfo,
  PairingStatus,
  TransferStatus,
} from "@naqlah/shared-types";
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}
export interface Pairing {
  id: string;
  codeHash: string;
  qrPayload: string;
  nonce: string;
  device: DeviceInfo;
  status: PairingStatus;
  userId?: string;
  userName?: string;
  attempts: number;
  expiresAt: Date;
  createdAt: Date;
  used: boolean;
}
export interface DeviceSession {
  tokenHash: string;
  pairingId: string;
  kind: "web" | "mini-app";
  userId?: string;
  expiresAt: Date;
}
export interface Transfer {
  id: string;
  pairingId: string;
  sender: "web" | "mini-app";
  receiver: "web" | "mini-app";
  contentType: ContentType;
  filename?: string;
  displayFilename?: string;
  mimeType?: string;
  size?: number;
  text?: string;
  url?: string;
  blobPath?: string;
  status: TransferStatus;
  createdAt: Date;
  expiresAt: Date;
  downloadedAt?: Date;
  deletedAt?: Date;
}
export class MemoryStore {
  users = new Map<string, User>();
  pairings = new Map<string, Pairing>();
  sessions = new Map<string, DeviceSession>();
  transfers = new Map<string, Transfer>();
}
