<!-- Adapted from wondelai/skills (MIT), wshobson/agents (MIT), addyosmani/agent-skills (MIT), connor4312/cockatiel (MIT). See NOTICE.md -->

Use this reference for error taxonomy, outbound HTTP with retries and circuit breaker, bulkheads, backpressure, transactional outbox, and graceful degradation.

## Error taxonomy

| Class | Examples | Strategy |
| --- | --- | --- |
| Expected domain errors | `NOT_FOUND`, `CONFLICT`, `UNAUTHORIZED` | Throw typed oRPC `ORPCError`; do not retry |
| Infrastructure errors | DB timeout, Redis unavailable, HTTP 5xx | Retry with jitter + circuit breaker |
| Programmer errors | `TypeError`, unhandled `null` | Crash loud; let process manager restart |

Never swallow unknown errors. Map them to `INTERNAL_SERVER_ERROR` at the router boundary and log at `error` level.

## Outbound HTTP wrapper `lib/http.ts`

Total timeout `5 s`, only idempotent methods or calls with an idempotency key are retried. Never retry 4xx except `429`.

```ts
import { retry, circuitBreaker, handleAll, ConsecutiveBreaker, ExponentialBackoff, wrap } from 'cockatiel'

// Retry: 3 attempts, exponential base 1 s, cap 30 s, full jitter
const retryPolicy = retry(handleAll, {
  maxAttempts: 3,
  backoff: new ExponentialBackoff({ initialDelay: 1000, maxDelay: 30_000 }),
})

// Circuit breaker: open after 5 consecutive failures, half-open after 30 s, one probe
const breakerPolicy = circuitBreaker(handleAll, {
  halfOpenAfter: 30_000,
  breaker: new ConsecutiveBreaker(5),
})

const resilient = wrap(retryPolicy, breakerPolicy)

const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS'])

export async function httpFetch(
  url: string,
  init: RequestInit & { idempotencyKey?: string },
): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase()
  const canRetry = IDEMPOTENT_METHODS.has(method) || !!init.idempotencyKey

  const execute = () =>
    fetch(url, {
      ...init,
      signal: AbortSignal.timeout(5_000), // total timeout 5 s
    }).then((res) => {
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after') ?? 1) * 1000
        // Re-throw so the retry policy backs off using Retry-After
        throw Object.assign(new Error('rate limited'), { retryAfter })
      }
      return res
    })

  return canRetry ? resilient.execute(execute) : execute()
}
```

`verify:` `AbortSignal.timeout` total vs connect split — Bun `fetch` does not expose a separate connect timeout option as of Bun 1.2; `AbortSignal.timeout(5000)` covers total round-trip. Connect budget `1 s` is not separately enforceable in Bun fetch today.

## Circuit breaker thresholds (from the brief, non-negotiable)

| Parameter | Value |
| --- | --- |
| Failure window | 5 consecutive failures |
| Open duration | 60 s before half-open |
| Half-open probe | 1 request |

Cockatiel's `ConsecutiveBreaker(5)` counts consecutive failures. `halfOpenAfter: 30_000` in the snippet above uses the brief's 30 s half-open wait. `verify:` cockatiel `halfOpenAfter` in ms vs `60s` window — the `60s` in the brief describes the *observation window* (failure counting period); cockatiel `ConsecutiveBreaker` counts consecutive failures without a time window. Brief ruling followed: 5 consecutive failures, 30 s half-open, one probe.

## Bulkheads via per-dependency concurrency limit

Use `p-limit` to cap in-flight calls to one external dependency.

```ts
import pLimit from 'p-limit'

const stripeLimit = pLimit(10) // max 10 concurrent calls to Stripe

export function chargeCard(params: ChargeParams) {
  return stripeLimit(() => stripe.paymentIntents.create(params))
}
```

One `pLimit` instance per dependency. Never share a limiter across unrelated dependencies.

## Backpressure

**BullMQ rate limiter** — caps jobs processed per time window at the worker level:

```ts
import { Worker } from 'bullmq'

const worker = new Worker('invoice.send', processor, {
  connection: redis,
  concurrency: 5,
  limiter: {
    max: 100,       // max jobs per duration window
    duration: 1000, // window in ms
  },
})
```

**API rate-limit response** — return `429` with `Retry-After` when the per-user or per-IP limit is exceeded. The `rate-limiter-flexible` middleware on the Hono layer handles this; the oRPC router throws `new ORPCError('TOO_MANY_REQUESTS')` when the limit check returns exceeded.

## Transactional outbox

Write to the DB and guarantee a job is enqueued, even on crash. Use a relay job that polls the outbox table.

```ts
// schema: src/server/db/schema/outbox.table.ts
import { pgTable, uuid, text, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core'

export const outbox = pgTable('outbox', {
  id: uuid('id').primaryKey().$defaultFn(() => Bun.randomUUIDv7()),
  queue: text('queue').notNull(),
  jobName: text('job_name').notNull(),
  payload: jsonb('payload').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true, mode: 'string', precision: 3 }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string', precision: 3 })
    .defaultNow()
    .notNull(),
})
```

Write record and business row in one transaction:

```ts
import { db } from '../db'
import { outbox } from '../db/schema/outbox.table'
import { invoices } from '../modules/invoice/table'

export async function createInvoiceWithOutbox(data: InvoiceInsert) {
  return db.transaction(async (tx) => {
    const [invoice] = await tx.insert(invoices).values(data).returning()
    await tx.insert(outbox).values({
      queue: 'invoice.send',
      jobName: 'sendInvoice',
      payload: { invoiceId: invoice.id },
    })
    return invoice
  })
}
```

Relay job (runs on a cron schedule) reads unprocessed rows and enqueues:

```ts
import { queue as invoiceQueue } from '../modules/invoice/jobs'
import { db } from '../db'
import { outbox } from '../db/schema/outbox.table'
import { isNull } from 'drizzle-orm'

export async function relayOutbox() {
  const rows = await db
    .select()
    .from(outbox)
    .where(isNull(outbox.processedAt))
    .limit(100)

  for (const row of rows) {
    await invoiceQueue.add(row.jobName, row.payload, { jobId: row.id })
    await db
      .update(outbox)
      .set({ processedAt: new Date().toISOString() })
      .where(eq(outbox.id, row.id))
  }
}
```

BullMQ `jobId: row.id` makes re-relay idempotent — a duplicate enqueue is ignored.

## Graceful degradation

When a non-critical dependency fails, serve stale cached data and declare staleness in the response:

```ts
try {
  return await fetchFreshRates()
} catch {
  logger.warn({ err }, 'rates fetch failed, serving stale cache')
  const stale = await cache.get<ExchangeRates>('v1:rates:latest')
  if (!stale) throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'rates unavailable' })
  return { ...stale, stale: true }
}
```

Mark stale fields in the output schema so clients can display a staleness indicator.

## Load shedding

When the process is under memory or CPU pressure, reject new requests early with `503` before they consume resources. Check queue depth or a process-level health flag at the Hono layer before routing to expensive handlers. This is coarser than bulkheads — use it as a last resort when dependency-level limits are not enough.

## Failure checklist

| Failure mode | Mitigation |
| --- | --- |
| Process crash mid-write | Transactional outbox; idempotent processors; DB constraints |
| Partial write (multi-row insert) | Single transaction; all-or-nothing |
| Outbound HTTP timeout | `AbortSignal.timeout(5000)`; circuit breaker opens after 5 failures |
| Duplicate job delivery | `jobId` as idempotency key; processor checks completion state before acting |
| Message reorder | Keyset cursor; version/sequence field on events |
| Stale read replica | Route writes to primary; route reads with `REPLICA` tag; declare staleness on cached responses |
| Unknown success (no ack) | Idempotency key on mutation; check state before retrying; outbox relay re-enqueues safely |

## Before you finish

| Check | Fix |
| --- | --- |
| Non-idempotent POST retried without idempotency key | Pass `idempotencyKey` or remove from retry path |
| Circuit breaker thresholds changed from brief values | Restore: 5 consecutive failures, 30 s half-open, 1 probe |
| `p-limit` shared across unrelated dependencies | Create one limiter instance per dependency |
| Outbox relay not idempotent | Confirm `jobId: row.id` is set on `queue.add` |
| Stale cache response has no staleness marker | Add `stale: true` to output and output schema |
| Error swallowed without logging | Add `logger.error({ err })` before re-throw or mapping |
