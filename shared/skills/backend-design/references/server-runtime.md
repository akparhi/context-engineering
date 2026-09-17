<!-- Adapted from honojs/skills, yusukebe/hono-skill, orpc-official, 2b reference project (MIT). See NOTICE.md -->

# Server runtime reference

Scope: `src/server/index.ts`, `src/server/app.ts`, env modules, Vite proxy, Dockerfile. All values are exact.

## `src/server/index.ts`

```ts
import { app } from "./app";
import { registerWorkers, workers } from "./jobs";
import { runMigrations } from "./db/migrate";
import { sql } from "./db";
import { redis } from "./lib/redis";
import { env } from "./env/server";
import { logger } from "./lib/logger";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PORT = env.PORT ?? 3000;

// Migrations run under pg_advisory_lock before anything serves or consumes
await runMigrations();

const server = Bun.serve({
  fetch: app.fetch,
  port: PORT,
});

logger.info({ port: PORT }, "server started");

if (env.ROLE === "all" || env.ROLE === "worker") {
  registerWorkers();
}

// Graceful shutdown: stop → drain 10s → workers 30s → pool → redis → exit; hard exit at 45s
let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutdown: stop accepting");

  setTimeout(() => {
    logger.error("shutdown: hard exit at 45s");
    process.exit(1);
  }, 45_000).unref();

  await Promise.race([server.stop(), sleep(10_000)]); // resolves when in-flight requests finish
  await Promise.race([Promise.all(workers.map((w) => w.close())), sleep(30_000)]);
  await sql.end({ timeout: 5 });
  await redis.quit();
  logger.info("shutdown: clean exit");
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

## `src/server/app.ts` — route order

Routes are matched top-down; register health/ready before RPC so they are never handled by the oRPC middleware.

```ts
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { RPCHandler } from "@orpc/server/fetch";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { router } from "./rpc";
import { allQueues } from "./jobs";
import { adminAuthMiddleware } from "./lib/admin-auth";
import { logger } from "./lib/logger";
import { env } from "./env/server";
import { sql } from "./db";
import { redis } from "./lib/redis";

export const app = new Hono();

// 1. Liveness — no dependency checks
app.get("/health", (c) => c.json({ status: "ok" }));

// 2. Readiness — checks DB + Redis with 1 s timeout
app.get("/ready", async (c) => {
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("ready timeout")), 1_000));
  try {
    await Promise.race([Promise.all([sql`select 1`, redis.ping()]), timeout]);
    return c.json({ status: "ready" });
  } catch (err) {
    logger.error(err, "readiness check failed");
    return c.json({ status: "unavailable" }, 503);
  }
});

// 3. oRPC — RPC procedures
const rpcHandler = new RPCHandler(router);

app.use("/rpc/*", async (c, next) => {
  const { matched, response } = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: {},       // populate with auth/session context here
  });
  if (matched) {
    return c.newResponse(response.body, response);
  }
  await next();
});

// 4. oRPC — OpenAPI REST surface
const openApiHandler = new OpenAPIHandler(router);

app.use("/api/*", async (c, next) => {
  const { matched, response } = await openApiHandler.handle(c.req.raw, {
    prefix: "/api",
    context: {},
  });
  if (matched) {
    return c.newResponse(response.body, response);
  }
  await next();
});

// 5. Bull board — admin UI behind auth
const serverAdapter = new HonoAdapter(serveStatic);
createBullBoard({
  queues: allQueues.map((q) => new BullMQAdapter(q)),
  serverAdapter,
});
serverAdapter.setBasePath("/admin/queues");
app.use("/admin/queues/*", adminAuthMiddleware);
app.route("/admin/queues", serverAdapter.registerPlugin());

// 6. SPA static assets — hashed files get immutable headers
app.use(
  "/assets/*",
  serveStatic({
    root: "./dist/client",
    onFound: (_path, c) => {
      c.header("Cache-Control", "public, immutable, max-age=31536000");
    },
  }),
);

// 7. index.html fallback for client-side routing; unmatched non-API GETs land here
app.get(
  "*",
  serveStatic({
    path: "./dist/client/index.html",
    onFound: (_path, c) => {
      c.header("Cache-Control", "no-cache");
    },
  }),
);
```

### Next.js variant (SSR only) runs on Node's HTTP server

Next's request handler takes Node `IncomingMessage`/`ServerResponse`, not a web `Request`. When the project needs SSR, run Hono through `@hono/node-server` instead of `Bun.serve`, keep all API routes above, and hand the rest to Next.

```ts
import next from "next";
import { serve } from "@hono/node-server";
import { RESPONSE_ALREADY_SENT } from "@hono/node-server/utils/response";

const nextApp = next({ dev: env.NODE_ENV !== "production" });
await nextApp.prepare();
const nextHandler = nextApp.getRequestHandler();

app.all("*", (c) => {
  nextHandler(c.env.incoming, c.env.outgoing);
  return RESPONSE_ALREADY_SENT;
});

serve({ fetch: app.fetch, port: PORT });
```

Remove the `/assets/*` and `index.html` static handlers in this variant; Next serves its own assets. Run the process with `node` or `bun` (`verify:` Next custom server under Bun for the pinned Next version).

## `ROLE` switch

`ROLE` env var controls what the process starts.

| Value | Behavior |
|---|---|
| `all` | Starts HTTP server + registers BullMQ workers |
| `web` | Starts HTTP server only |
| `worker` | Registers BullMQ workers only; no HTTP server |

## Env modules

### `src/server/env/server.ts`

`isServer` only makes t3-env throw when a server variable is *read* in the browser — it guards property access through a Proxy, not the import. Add an explicit top-level throw so bundling this module into client code fails immediately.

```ts
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

if (typeof window !== "undefined") {
  throw new Error("env/server.ts imported in a browser bundle");
}

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().default(3000),
    ROLE: z.enum(["all", "web", "worker"]).default("all"),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    AUTH_SECRET: z.string().min(32),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    ROLE: process.env.ROLE,
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
  },
  emptyStringAsUndefined: true,
  isServer: typeof window === "undefined",
});
```

### `src/server/env/client.ts`

```ts
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_API_URL: z.string().url().optional(),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
});
```

## Vite dev proxy config

```ts
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      "/rpc": "http://localhost:3000",
      "/api": "http://localhost:3000",
      "/admin": "http://localhost:3000",
    },
  },
});
```

## Dockerfile

```dockerfile
FROM oven/bun:1.2-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM base AS build
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build          # Vite emits the SPA into dist/client

FROM base AS final
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist/client ./dist/client
COPY drizzle ./drizzle
COPY src ./src
COPY tsconfig.json ./

ENV NODE_ENV=production
EXPOSE 3000
# Bun runs TypeScript directly — no server bundle step
CMD ["bun", "src/server/index.ts"]
```

## Before you finish

| Check | Pass condition |
|---|---|
| `/health` registered before `/rpc/*` | Health never routed to oRPC |
| `c.newResponse(response.body, response)` used for oRPC routes | Not `c.json()` or `c.text()` |
| `runMigrations()` awaited before `Bun.serve` and `registerWorkers()` | Nothing serves or consumes on an unmigrated schema |
| `env/server.ts` has an explicit top-level `window` throw | `isServer` alone guards property access, not import |
| Final image contains `dist/client` and `drizzle/` | SPA fallback and boot migrations both resolve |
| `env/client.ts` uses `clientPrefix: "VITE_"` | All client vars prefixed |
| `emptyStringAsUndefined: true` in both env modules | Empty strings not silently valid |
| `runtimeEnv` lists every var explicitly | No `process.env` spread |
| Graceful shutdown: hard exit at 45 s | `setTimeout(..., 45_000).unref()` present |
| Hashed assets: immutable cache header | `onFound` sets `Cache-Control: public, immutable` |
| `index.html` served for non-API GETs | SPA routing works after hard reload |
