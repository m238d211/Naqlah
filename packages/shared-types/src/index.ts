export const pairingStatuses = ['pending','claimed','active','expired','rejected','closed'] as const;
export type PairingStatus = typeof pairingStatuses[number];
export const transferStatuses = ['uploading','ready','downloaded','expired','failed','deleted'] as const;
export type TransferStatus = typeof transferStatuses[number];
export type ContentType = 'file'|'text'|'url';
export type DeviceKind = 'web'|'mini-app';
export interface ApiSuccess<T> { ok: true; data: T }
export interface ApiFailure { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } }
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
export interface DeviceInfo { kind: DeviceKind; browser?: string; operatingSystem?: string; createdAt: string }
export interface PairingSessionView { id: string; qrPayload: string; manualCode: string; expiresAt: string; status: PairingStatus; device: DeviceInfo }
export interface PairingStatusView { id: string; status: PairingStatus; expiresAt: string; userName?: string; device: DeviceInfo }
export interface TransferView { id: string; contentType: ContentType; filename?: string; displayFilename?: string; mimeType?: string; size?: number; text?: string; url?: string; status: TransferStatus; createdAt: string; expiresAt: string; sender: DeviceKind; receiver: DeviceKind }
export interface AppSession { accessToken: string; expiresAt: string; user: { id: string; name: string; email: string } }
export const MAX_FILE_SIZE = 100 * 1024 * 1024;
