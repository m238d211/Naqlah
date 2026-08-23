import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './app.js';

type VercelRequest = IncomingMessage & { body?: unknown; url?: string; method?: string };
const app = createApp();

async function readBody(request: VercelRequest): Promise<string | undefined> {
  if (request.body !== undefined) return typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  const length = Number(request.headers['content-length'] ?? 0);
  if (!length || request.readableEnded) return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(request: VercelRequest, response: ServerResponse): Promise<void> {
  const protocol = request.headers['x-forwarded-proto'] ?? 'https';
  const host = request.headers.host ?? 'localhost';
  const url = `${protocol}://${host}${request.url ?? '/'}`;
  const body = await readBody(request);
  const webRequest = new Request(url, {
    method: request.method ?? 'GET',
    headers: request.headers as Record<string, string>,
    body: body && request.method !== 'GET' && request.method !== 'HEAD' ? body : undefined,
  });
  const webResponse = await app.fetch(webRequest);
  response.statusCode = webResponse.status;
  webResponse.headers.forEach((value, key) => response.setHeader(key, value));
  response.end(Buffer.from(await webResponse.arrayBuffer()));
}
