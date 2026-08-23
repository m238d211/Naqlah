import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadEnv } from "@naqlah/config";
import { createStore } from "./store.js";
const env = loadEnv();
serve(
  {
    fetch: createApp({ env, store: createStore(env) }).fetch,
    port: env.PORT,
  },
  (info) => console.log(`Naqlah API listening on ${info.port}`),
);
