import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadEnv } from '@naqlah/config';
const env=loadEnv(); serve({fetch:createApp({env,store:new (await import('./store.js')).MemoryStore()}).fetch,port:env.PORT}, info=>console.log(`Naqlah API listening on ${info.port}`));
