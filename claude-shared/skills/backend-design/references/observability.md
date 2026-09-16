<!-- Adapted from addyosmani/agent-skills (MIT), pinojs/pino (MIT), prometheus/client_js (MIT). See NOTICE.md -->

Use this reference for all observability setup: pino logger, request context, Hono and oRPC middleware, metrics, health routes, and BullMQ job logging.

## Set up pino in `lib/logger.ts`

JSON in prod, `pino-pretty` transport in dev. Base fields bind at construction; child loggers add per-request fields.

```ts
import pino from 'pino'
import { env } from '../env/server'

export const logger = pino({
  level: env.LOG_LEVEL ?? 'info',
  base: { service: env.SERVICE_NAME, env: env.NODE_ENV, version: env.APP_VERSION },
  serializers: { err: pino.stdSerializers.err },
  redact: [
    'req.headers.authorization',
    'req.headers.cookie',
    '*.password',
    '*.token',
    '*.secret',
  ],
  transport:
    env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
})
```

`pino.stdSerializers.err` serializes `Error` instances to `{ type, message, stack }`.

## Carry request context with `AsyncLocalStorage` in `lib/request-context.ts`

Bun supports `node:async_hooks`; `AsyncLocalStorage` works without polyfill.

```ts
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Logger } from 'pino'

export interface RequestContext {
  requestId: string
  userId: string | undefined
  orgId: string | undefined
  logger: Logger
}

export const als = new AsyncLocalStorage<RequestContext>()

export function getContext(): RequestContext {
  const ctx = als.getStore()
  if (!ctx) throw new Error('Called outside request context')
  return ctx
}
```

## Add Hono middleware that sets request context

Reads `x-request-id` header or generates one, writes it back, then runs the handler inside `als.run`.

```ts
import { createMiddleware } from 'hono/factory'
import { als, type RequestContext } from '../lib/request-context'
import { logger } from '../lib/logger'

export const requestContext = createMiddleware(async (c, next) => {
  const requestId = c.req.header('x-request-id') ?? crypto.randomUUID()
  c.header('x-request-id', requestId)

  const ctx: RequestContext = {
    requestId,
    userId: undefined,
    orgId: undefined,
    logger: logger.child({ requestId }),
  }

  await als.run(ctx, next)
})
```

Mount before all routes: `app.use('*', requestContext)`.

## Log one `info` line per oRPC procedure

Use an oRPC middleware on the base procedure. Logs `requestId`, `procedure`, `userId`, `orgId`, `durationMs`, `status`.

```ts
import { os } from '@orpc/server'
import { getContext } from '../lib/request-context'

export const baseProcedure = os.use(async ({ next, path }) => {
  const ctx = getContext()
  const start = performance.now()
  try {
    const result = await next()
    ctx.logger.info({
      requestId: ctx.requestId,
      procedure: path.join('.'),
      userId: ctx.userId,
      orgId: ctx.orgId,
      durationMs: Math.round(performance.now() - start),
      status: 'ok',
    }, 'rpc')
    return result
  } catch (err) {
    ctx.logger.error({
      requestId: ctx.requestId,
      procedure: path.join('.'),
      userId: ctx.userId,
      orgId: ctx.orgId,
      durationMs: Math.round(performance.now() - start),
      status: 'error',
      err,
    }, 'rpc')
    throw err
  }
})
```

## Log levels

| Condition | Level |
| --- | --- |
| One line per completed request | `info` |
| Expected 4xx (validation, not found) | `warn` |
| Slow query (over 200 ms) | `warn` |
| 5xx / unhandled error | `error` with `err` field |
| Never | `console.*` |

## Log slow queries via a Drizzle logger wrapper

SQL text and param count only — never param values.

```ts
import type { Logger as DrizzleLogger } from 'drizzle-orm'
import { getContext } from './request-context'

export class SlowQueryLogger implements DrizzleLogger {
  private readonly threshold = 200

  logQuery(query: string, params: unknown[]): void {
    // called after query; measure via drizzle logger timing verify:
  }

  warn(query: string, params: unknown[], durationMs: number): void {
    if (durationMs >= this.threshold) {
      const { logger } = getContext()
      logger.warn({ query, paramCount: params.length, durationMs }, 'slow query')
    }
  }
}
```

Pass to Drizzle: `drizzle(sql, { logger: new SlowQueryLogger() })`. `verify:` Drizzle v1 logger interface signature (method name, timing argument).

## RED metrics per procedure with `prom-client`

Histogram buckets from the brief: `[5, 10, 25, 50, 100, 250, 500, 1000, 2500]` ms. Labels: `procedure`, `status`. Never `userId`.

```ts
import { Histogram, Registry, collectDefaultMetrics } from 'prom-client'

export const registry = new Registry()
collectDefaultMetrics({ register: registry })

export const rpcDuration = new Histogram({
  name: 'rpc_procedure_duration_ms',
  help: 'oRPC procedure duration in milliseconds',
  labelNames: ['procedure', 'status'] as const,
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500],
  registers: [registry],
})
```

Observe inside the base procedure middleware:

```ts
rpcDuration.labels({ procedure: path.join('.'), status: isError ? 'error' : 'ok' })
  .observe(durationMs)
```

Expose `/metrics` behind admin auth:

```ts
app.get('/metrics', adminAuth, async (c) => {
  return c.text(await registry.metrics(), 200, {
    'content-type': registry.contentType,
  })
})
```

OTel path: replace `prom-client` with `@opentelemetry/sdk-metrics` and a Prometheus exporter; the RED label rules and histogram buckets stay identical.

## Log BullMQ jobs

Log in the processor, not in queue event listeners. Include `jobId`, `queue`, `attempt`, `durationMs`.

```ts
import type { Job } from 'bullmq'
import { logger } from '../lib/logger'

export async function processor(job: Job): Promise<void> {
  const start = performance.now()
  const log = logger.child({ jobId: job.id, queue: job.queueName, attempt: job.attemptsMade })
  try {
    await doWork(job)
    log.info({ durationMs: Math.round(performance.now() - start) }, 'job completed')
  } catch (err) {
    log.error({ err, durationMs: Math.round(performance.now() - start) }, 'job failed')
    throw err
  }
}
```

## Health routes

`GET /health` — liveness, no dependencies:

```ts
app.get('/health', (c) => c.json({ status: 'ok' }))
```

`GET /ready` — readiness; DB `select 1` and Redis `ping` under 1 s:

```ts
app.get('/ready', async (c) => {
  const timeout = AbortSignal.timeout(1000)
  try {
    await Promise.all([
      sql`select 1`.execute({ signal: timeout }),
      redis.ping(),
    ])
    return c.json({ status: 'ready' })
  } catch (err) {
    logger.error({ err }, 'readiness check failed')
    return c.json({ status: 'not ready' }, 503)
  }
})
```

`verify:` postgres-js `AbortSignal` option on query.

## Error reporting hook point

Wire into the oRPC `RPCHandler` `interceptors` option:

```ts
import { onError } from '@orpc/server'

const handler = new RPCHandler(router, {
  interceptors: [
    onError((err) => {
      logger.error({ err }, 'unhandled rpc error')
      // Sentry.captureException(err) // optional
    }),
  ],
})
```

## What never to log

- Param values from SQL queries.
- JWT tokens, cookies, passwords, secrets (covered by `redact`).
- Full request/response bodies (log field names and sizes only).
- PII: email, phone, full name — log `userId` / `orgId` instead.

## Before you finish

| Check | Fix |
| --- | --- |
| `console.log` / `console.error` anywhere in server code | Replace with `logger` or `ctx.logger` |
| Log line missing `requestId` | Call `getContext()` and use `ctx.logger` |
| Metric label includes `userId` or raw URL | Change to `procedure` + `status` only |
| `/metrics` route has no auth | Add `adminAuth` middleware |
| `GET /ready` has no timeout guard | Wrap in `AbortSignal.timeout(1000)` |
| Sensitive field in log output | Add path to `redact` array in `lib/logger.ts` |
| Slow query threshold differs from 200 ms | Align `SlowQueryLogger.threshold` to `200` |
