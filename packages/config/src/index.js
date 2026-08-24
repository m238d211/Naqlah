import { z } from 'zod';
export const envSchema = z.object({
  NODE_ENV: z.enum(['development','test','production']).default('development'), PORT: z.coerce.number().int().positive().default(8787),
  MONGODB_URI: z.string().default('mongodb://localhost:27017'), DATABASE_NAME: z.string().default('naqlah'),
  JWT_SECRET: z.string().min(16).default('development-jwt-secret-change-me'), PAIRING_TOKEN_SECRET: z.string().min(16).default('development-pairing-secret-change-me'),
  SUPERAPP_SHARED_SECRET: z.string().min(16).default('development-superapp-secret-change-me'), MINI_APP_ID: z.string().min(1).default('development-mini-app-id'),
  CRON_SECRET: z.string().min(8).default('development-cron-secret'), BLOB_READ_WRITE_TOKEN: z.string().optional(),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174'), WEB_APP_ORIGIN: z.string().url().default('http://localhost:5173'), MINI_APP_ORIGIN: z.string().url().default('http://localhost:5174'),
  TRANSFER_MAX_FILE_SIZE: z.coerce.number().int().positive().max(100 * 1024 * 1024).default(100 * 1024 * 1024), PAIRING_CODE_TTL_SECONDS: z.coerce.number().int().positive().default(120), ACTIVE_PAIRING_TTL_SECONDS: z.coerce.number().int().positive().default(86400), TRANSFER_TTL_SECONDS: z.coerce.number().int().positive().default(86400)
});
export function loadEnv(input = process.env) { return envSchema.parse(input); }
