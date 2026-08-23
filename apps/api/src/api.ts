import { handle } from '@hono/node-server/vercel';
import { createApp } from './app.js';

// Vercel's Node runtime passes IncomingMessage/ServerResponse. The Hono
// adapter converts them to Web Request/Response objects before dispatching.
export default handle(createApp());
