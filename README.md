# Naqlah / نقلة

Naqlah is a personal, temporary file-transfer workspace between a computer and a phone. It supports files, plain text, and URLs through a browser and a Super Badi Mini App. The two clients communicate through the Vercel API and never require the same local network.

## Architecture

```text
apps/web       -> Surge (computer UI)
apps/mini-app  -> Surge (Super Badi Mini App UI)
apps/api       -> Vercel Functions -> MongoDB Atlas + private Vercel Blob
```

This repository is an npm-workspaces monorepo. It does not use SuperQi authentication. Only the Mini App uses Super Badi SSO. The website is an anonymous temporary device and stores its short-lived device token in `sessionStorage`.

## Local setup

Requirements: Node.js 20+, npm, MongoDB Atlas (or a local MongoDB for the production repository adapter), and a Vercel Blob private store for real file uploads.

```bash
npm install
copy .env.example .env
npm run dev:api       # http://localhost:8787
npm run dev:web       # http://localhost:5173
npm run dev:mini      # http://localhost:5174
```

Create `apps/web/.env` and `apps/mini-app/.env` from their `.env.example` files. Set `VITE_API_BASE_URL=http://localhost:8787` locally, or the deployed Vercel API URL in production. This variable is frontend-safe because it contains only the public API address. The API defaults are deliberately development-only. Production must use strong generated secrets.

## Super Badi SSO

The Mini App follows `mini-app-auth`: Super Badi launches the Mini App with a URL-encoded `exchange_token`. The browser sends it once to `POST /api/v1/auth/exchange-token`; the backend verifies its JWT signature with server-only `SUPERAPP_SHARED_SECRET`, normal expiration, `typ=mini_app_sso`, and `aud=MINI_APP_ID`. It then issues a separate short-lived Naqlah session and removes the exchange token from the URL with `history.replaceState`. The exchange token and shared secret are never logged or bundled.

The Super Badi contract is the only SSO source of truth. Do not replace it with username/password login or a frontend secret.

## Commands

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run build:web
npm run build:mini
npm run build:api
```

`build:web` and `build:mini` create independent `dist` folders and generate `200.html` for Surge SPA fallback using a cross-platform Node script.

## Environment variables

See `.env.example`. Required production values include `MONGODB_URI`, `DATABASE_NAME`, `JWT_SECRET`, `PAIRING_TOKEN_SECRET`, `SUPERAPP_SHARED_SECRET`, `MINI_APP_ID`, `CRON_SECRET`, `BLOB_READ_WRITE_TOKEN`, `ALLOWED_ORIGINS`, `WEB_APP_ORIGIN`, `MINI_APP_ORIGIN`, and transfer/expiration limits. Only `VITE_API_BASE_URL` is safe for frontend builds. Never prefix backend secrets with `VITE_`.

`ALLOWED_ORIGINS` must contain the exact two Surge origins and explicitly approved local origins, comma-separated. Do not use `*` in production.

## Pairing and transfer security

Pairing codes use cryptographic randomness, omit `0/O/1/I`, are stored as SHA-256 hashes, expire after two minutes, are one-use, and are limited to five attempts. QR claims use a signed payload. Scanning or entering a code only changes `pending` to `claimed`; the Mini App user must explicitly approve or reject the request.

Files are limited to 100 MB. The upload endpoint creates metadata and an authorization for direct private Blob upload; file bytes must not be proxied through a Vercel Function. Receivers get temporary authorized access and confirm successful download before delayed cleanup. Unknown or executable types should be downloaded as attachments and must not be treated as malware-free.

The current local development adapter returns no Blob URL when Blob is not configured, making this limitation visible rather than silently accepting a fake upload. The production deployment must connect the upload authorization and completion hooks to Vercel Blob private storage.

## MongoDB and cleanup

The production data model is `users`, `pairing_sessions`, `device_sessions`, and `transfers`, with indexes on user IDs, pairing ownership, hashed lookup references, device sessions, transfer sessions/status, and expiration dates. Pairing and transfer expiration should have MongoDB TTL indexes. TTL does not delete Blob objects, so the protected `POST /api/v1/cleanup` endpoint (header `X-Cron-Secret`) must process bounded batches, delete expired metadata and Blob objects idempotently, and log only counts and IDs safe for operations. Configure cron-job.org to call the deployed endpoint daily with `X-Cron-Secret`; no Vercel Cron is used.

## Deployment

### Surge frontends

Build from the repository root, then deploy each directory independently:

```bash
npm run build:web
npx surge apps/web/dist naqlah-web.surge.sh
npm run build:mini
npx surge apps/mini-app/dist naqlah-mini.surge.sh
```

Replace the domains with approved names and set each frontend's `VITE_API_BASE_URL` before building. Configure the same exact origins in API `ALLOWED_ORIGINS`, `WEB_APP_ORIGIN`, and `MINI_APP_ORIGIN`. Deployment is intentionally not performed by this project setup.

### Vercel API

Create a separate Vercel project connected to this repository, set Root Directory to `apps/api`, keep workspace detection enabled, and let Vercel use its default Node.js runtime. The repository intentionally does not override the runtime in `vercel.json`; Vercel documents Node.js as the default for TypeScript/JavaScript Functions.

```text
Install Command: npm install --include=dev
Build Command: npm run build
Output Directory: (empty; Functions)
```

The API build script compiles the three workspace packages to `dist` before compiling the API. This is required because Vercel runs Node.js against JavaScript output and must not load the shared packages' TypeScript source files at runtime.

Add the API environment variables in the Vercel project, configure MongoDB Atlas network access and the Vercel Blob private token, and set the daily Cron secret in the Vercel environment. Do not deploy or create these external resources without explicit approval.

## Testing and limitations

The included API tests cover safe code generation and hashing, pairing creation, and cron authorization. The initial UI is a lightweight functional shell with polling and accessible form states. QR camera integration, a real Vercel Blob `handleUpload` adapter, MongoDB repository wiring, browser download confirmation, and end-to-end SSO integration require the deployment credentials and platform-specific integration configuration that are intentionally absent from this repository. WebSockets are intentionally deferred; the query layer polls about every two seconds and can be replaced later without changing the UI contract.

## Structure

```text
apps/web/          computer interface
apps/mini-app/     Super Badi Mini App interface
apps/api/          Hono/Vercel API
packages/shared-types/
packages/validation/
packages/config/
scripts/create-spa-fallback.mjs
```
