import { MongoClient, type Collection, type Db, type Filter } from 'mongodb';
import type { AppEnv } from '@naqlah/config';
import type { ContentType, DeviceInfo, PairingStatus, TransferStatus } from '@naqlah/shared-types';

export interface User { id: string; email: string; name: string; createdAt: Date }
export interface Pairing { id: string; codeHash: string; qrPayload: string; nonce: string; device: DeviceInfo; status: PairingStatus; userId?: string; userName?: string; attempts: number; expiresAt: Date; createdAt: Date; used: boolean; manualCode?: string }
export interface DeviceSession { tokenHash: string; pairingId: string; kind: 'web'|'mini-app'; userId?: string; expiresAt: Date }
export interface Transfer { id: string; pairingId: string; sender: 'web'|'mini-app'; receiver: 'web'|'mini-app'; contentType: ContentType; filename?: string; displayFilename?: string; mimeType?: string; size?: number; text?: string; url?: string; blobPath?: string; status: TransferStatus; createdAt: Date; expiresAt: Date; downloadedAt?: Date; deletedAt?: Date }

export interface Store {
  ready(): Promise<void>; ping(): Promise<void>;
  getUser(id: string): Promise<User | undefined>; setUser(user: User): Promise<void>;
  getPairing(id: string): Promise<Pairing | undefined>; setPairing(pairing: Pairing): Promise<void>;
  findPendingPairingByCodeHash(codeHash: string, at: Date): Promise<Pairing | undefined>; listPairings(): Promise<Pairing[]>;
  getSession(tokenHash: string): Promise<DeviceSession | undefined>; setSession(session: DeviceSession): Promise<void>;
  getTransfer(id: string): Promise<Transfer | undefined>; setTransfer(transfer: Transfer): Promise<void>;
  listTransfersByPairing(pairingId: string): Promise<Transfer[]>; listTransfers(): Promise<Transfer[]>;
}

class MapStore implements Store {
  private readonly users = new Map<string, User>(); private readonly pairings = new Map<string, Pairing>();
  private readonly sessions = new Map<string, DeviceSession>(); private readonly transfers = new Map<string, Transfer>();
  async ready(): Promise<void> {} async ping(): Promise<void> {}
  async getUser(id: string) { return this.users.get(id); } async setUser(user: User) { this.users.set(user.id, user); }
  async getPairing(id: string) { return this.pairings.get(id); } async setPairing(pairing: Pairing) { this.pairings.set(pairing.id, pairing); }
  async findPendingPairingByCodeHash(codeHash: string, at: Date) { return [...this.pairings.values()].find(p => p.status === 'pending' && p.expiresAt > at && p.codeHash === codeHash); }
  async listPairings() { return [...this.pairings.values()]; }
  async getSession(tokenHash: string) { return this.sessions.get(tokenHash); } async setSession(session: DeviceSession) { this.sessions.set(session.tokenHash, session); }
  async getTransfer(id: string) { return this.transfers.get(id); } async setTransfer(transfer: Transfer) { this.transfers.set(transfer.id, transfer); }
  async listTransfersByPairing(pairingId: string) { return [...this.transfers.values()].filter(t => t.pairingId === pairingId); } async listTransfers() { return [...this.transfers.values()]; }
}
export class MemoryStore extends MapStore {}

let cachedClient: MongoClient | undefined; let cachedUri: string | undefined;
function getClient(uri: string): MongoClient { if (!cachedClient || cachedUri !== uri) { cachedClient = new MongoClient(uri, { maxPoolSize: 10, minPoolSize: 0, serverSelectionTimeoutMS: 5000 }); cachedUri = uri; } return cachedClient; }
type MongoDocument<T> = T & { _id: string };

export class MongoStore implements Store {
  private readonly client: MongoClient; private readonly db: Db; private initialized?: Promise<void>;
  constructor(private readonly env: AppEnv) { this.client = getClient(env.MONGODB_URI); this.db = this.client.db(env.DATABASE_NAME); }
  async ready(): Promise<void> { if (!this.initialized) this.initialized = this.initialize().catch(error => { this.initialized = undefined; throw error; }); await this.initialized; }
  private async initialize(): Promise<void> {
    await this.client.connect();
    await Promise.all([
      this.db.collection('users').createIndex({ id: 1 }, { unique: true }),
      this.db.collection('pairing_sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      this.db.collection('pairing_sessions').createIndex({ codeHash: 1, status: 1 }), this.db.collection('pairing_sessions').createIndex({ userId: 1, status: 1 }),
      this.db.collection('device_sessions').createIndex({ tokenHash: 1 }, { unique: true }), this.db.collection('device_sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      this.db.collection('transfers').createIndex({ pairingId: 1, createdAt: -1 }), this.db.collection('transfers').createIndex({ pairingId: 1, status: 1 }), this.db.collection('transfers').createIndex({ expiresAt: 1 })
    ]);
  }
  async ping(): Promise<void> { await this.ready(); await this.db.command({ ping: 1 }); }
  private collection<T>(name: string): Collection<MongoDocument<T>> { return this.db.collection<MongoDocument<T>>(name); }
  private async get<T>(name: string, id: string): Promise<T | undefined> { await this.ready(); const doc = await this.collection<T>(name).findOne({ _id: id } as Filter<MongoDocument<T>>); if (!doc) return undefined; const { _id: _ignored, ...value } = doc; return value as T; }
  private async set<T extends { id: string }>(name: string, value: T): Promise<void> { await this.ready(); await this.collection<T>(name).replaceOne({ _id: value.id } as Filter<MongoDocument<T>>, { ...value, _id: value.id } as MongoDocument<T>, { upsert: true }); }
  async getUser(id: string) { return this.get<User>('users', id); } async setUser(user: User) { return this.set('users', user); }
  async getPairing(id: string) { return this.get<Pairing>('pairing_sessions', id); } async setPairing(pairing: Pairing) { return this.set('pairing_sessions', pairing); }
  async findPendingPairingByCodeHash(codeHash: string, at: Date) { await this.ready(); const doc = await this.collection<Pairing>('pairing_sessions').findOne({ codeHash, status: 'pending', expiresAt: { $gt: at } }); if (!doc) return undefined; const { _id: _ignored, ...value } = doc; return value as Pairing; }
  async listPairings() { await this.ready(); return (await this.collection<Pairing>('pairing_sessions').find({}).toArray()).map(({ _id: _ignored, ...value }) => value as Pairing); }
  async getSession(tokenHash: string) { await this.ready(); const doc = await this.collection<DeviceSession>('device_sessions').findOne({ tokenHash }); if (!doc) return undefined; const { _id: _ignored, ...value } = doc; return value as DeviceSession; }
  async setSession(session: DeviceSession) { await this.ready(); await this.collection<DeviceSession>('device_sessions').replaceOne({ _id: session.tokenHash }, { ...session, _id: session.tokenHash } as MongoDocument<DeviceSession>, { upsert: true }); }
  async getTransfer(id: string) { return this.get<Transfer>('transfers', id); } async setTransfer(transfer: Transfer) { return this.set('transfers', transfer); }
  async listTransfersByPairing(pairingId: string) { await this.ready(); return (await this.collection<Transfer>('transfers').find({ pairingId }).sort({ createdAt: -1 }).toArray()).map(({ _id: _ignored, ...value }) => value as Transfer); }
  async listTransfers() { await this.ready(); return (await this.collection<Transfer>('transfers').find({}).toArray()).map(({ _id: _ignored, ...value }) => value as Transfer); }
}
export function createStore(env: AppEnv): Store { return env.NODE_ENV === 'production' ? new MongoStore(env) : new MemoryStore(); }
