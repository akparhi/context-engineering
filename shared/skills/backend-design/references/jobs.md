<!-- Adapted from wondelai-skills, sickn33-agentic, aj-geddes-prompts, stack-profile-9b (MIT). See NOTICE.md -->

BullMQ layout for the Bun + Hono stack — file structure, default options, idempotency, and operations patterns.

## Each feature module owns its own `jobs.ts`

`modules/<feature>/jobs.ts` exports three things: `queue`, `enqueue()`, and `processor`. Types live inline or in a co-located `types.ts`.

```typescript
// modules/invoice/jobs.ts
import { Queue, Job } from "bullmq";
import { jobsRedis } from "@/lib/redis";
import { defaultJobOptions } from "@/lib/jobs/options";
import type { InvoiceJobData, InvoiceJobResult } from "./types";

export const queue = new Queue<InvoiceJobData, InvoiceJobResult>("invoice.send", {
  connection: jobsRedis,
  defaultJobOptions,
});

export async function enqueue(data: InvoiceJobData, jobId: string): Promise<void> {
  await queue.add("invoice.send", data, { jobId }); // jobId = idempotency key
}

export async function processor(job: Job<InvoiceJobData, InvoiceJobResult>): Promise<InvoiceJobResult> {
  // see idempotency section below
  return doWork(job.data);
}
```

## Queue names follow `domain.action`

Use dot-separated lowercase. The domain is the bounded context; the action is the work being done.

```
invoice.send
payment.capture
report.generate
email.deliver
```

## Default job options — copy these exactly

Never vary `attempts`, `backoff`, or retention settings per job unless there is a stated reason.

```typescript
// src/lib/jobs/options.ts
import type { JobsOptions } from "bullmq";

export const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 1000 },
  removeOnComplete: { age: 86_400, count: 1_000 }, // keep 1d or 1000 entries
  removeOnFail: { age: 604_800 },                  // keep 7d for DLQ inspection
};
```

## Register workers in `src/server/jobs/index.ts` under `ROLE`

Workers start only when `ROLE` is `all` or `worker`. The web role skips them. One shared ioredis connection with `maxRetriesPerRequest: null` for all BullMQ workers.

```typescript
// src/server/jobs/index.ts
import { Worker } from "bullmq";
import { jobsRedis } from "@/lib/redis";
import { processor as invoiceProcessor } from "@/modules/invoice/jobs";
import { processor as reportProcessor } from "@/modules/report/jobs";
import { env } from "@/env/server";
import { logger } from "@/lib/logger";

export let workers: Worker[] = [];

export function registerWorkers(): void {
  if (env.ROLE !== "all" && env.ROLE !== "worker") return;

  workers = [
    createWorker("invoice.send", invoiceProcessor),
    createWorker("report.generate", reportProcessor, { concurrency: 1 }), // CPU-bound
  ];

  for (const worker of workers) {
    worker.on("failed", (job, err) => {
      logger.error({ jobId: job?.id, queue: worker.name, err }, "job failed");
    });
  }
}

function createWorker<D, R>(
  name: string,
  processor: (job: import("bullmq").Job<D, R>) => Promise<R>,
  overrides?: Partial<import("bullmq").WorkerOptions>,
): Worker<D, R> {
  return new Worker<D, R>(name, processor, {
    connection: jobsRedis,
    concurrency: 5,        // default; 20 for IO-bound; 1 for CPU-bound
    lockDuration: 30_000,
    ...overrides,
  });
}
```

## `jobId` is the idempotency key — duplicate enqueues collapse

Passing the same `jobId` twice does not create a second job. Derive `jobId` from domain identity, e.g. `invoice-${invoiceId}` or an external reference. A custom `jobId` must not contain `:`, which BullMQ reserves as its Redis key separator, and must not be all digits.

```typescript
await enqueue({ orgId, invoiceId }, `invoice-${invoiceId}`);
// Second call with same jobId is a no-op — BullMQ deduplicates
```

Deduplication lasts only while the job exists in Redis. `removeOnComplete` deletes it after `1d` or `1000` entries, and the same `jobId` is then accepted again. The database-side idempotency marker in the next section is the real guard.

## Job data carries `orgId`; the processor sets the tenant scope

There is no request context in a worker. Every job payload carries `{ orgId, ...ids }`. The processor opens a transaction and sets `app.org_id` before any tenant-scoped read, so RLS policies apply.

```typescript
export interface InvoiceJobData {
  orgId: string;
  invoiceId: string;
}

await db.transaction(async (tx) => {
  await tx.execute(sql`select set_config('app.org_id', ${job.data.orgId}, true)`);
  // tenant-scoped reads and writes on tx from here
});
```

The `true` third argument makes the setting transaction-local, so it is discarded on commit and never leaks to the next pooled checkout.

## Processor claims the work, sends outside the transaction, then marks it sent

No network call goes inside `db.transaction`. A rollback cannot un-send an email. Claim the row in a short transaction, perform the side effect after it commits with a provider idempotency key, then record completion.

```typescript
export async function processor(job: Job<InvoiceJobData>): Promise<void> {
  const { orgId, invoiceId } = job.data;

  // 1. Claim: lock the row, check the marker, record the attempt. Commits immediately.
  const claimed = await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);

    const invoice = await tx.query.invoices.findFirst({
      where: { id: { eq: invoiceId } },
      // FOR UPDATE so two workers cannot claim the same invoice
    }).for("update");

    if (!invoice) throw new UnrecoverableError("invoice not found");
    if (invoice.sentAt) return undefined; // already sent — idempotent exit

    await tx
      .update(invoices)
      .set({ sendClaimedAt: sql`now()` })
      .where(eq(invoices.id, invoice.id));

    return invoice;
  });

  if (!claimed) return;

  // 2. Send outside the transaction. The provider deduplicates on this key.
  await sendInvoiceEmail(claimed, { idempotencyKey: `invoice-${invoiceId}` });

  // 3. Mark sent. If this fails, the retry re-sends and the provider drops the duplicate.
  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    await tx
      .update(invoices)
      .set({ sentAt: sql`now()` })
      .where(eq(invoices.id, invoiceId));
  });
}
```

The provider idempotency key, not the transaction, is what makes a duplicate send harmless. A stale `sendClaimedAt` with no `sentAt` after the lock duration means a crash between steps 2 and 3; the retry re-sends under the same key.

## Throw `UnrecoverableError` for permanent failures

BullMQ stops retrying and moves the job to the failed set immediately. Use for invalid input, missing entities, and business-rule violations that retrying cannot fix.

```typescript
import { UnrecoverableError } from "bullmq";

if (!user) throw new UnrecoverableError("user deleted — cannot send invoice");
if (invoice.status === "void") throw new UnrecoverableError("voided invoice");
```

## Use `upsertJobScheduler` for cron jobs

Pass a cron `pattern` or an `every` interval in milliseconds. The scheduler ID is stable across deploys — upserting is idempotent.

```typescript
// src/server/jobs/schedulers.ts
import { queue as reportQueue } from "@/modules/report/jobs";

export async function registerSchedulers(): Promise<void> {
  await reportQueue.upsertJobScheduler(
    "report.generate:daily",            // stable ID
    { pattern: "0 0 6 * * *" },        // 6 AM UTC daily
    { name: "report.generate", data: { type: "daily" } },
  );
}
```

## Use FlowProducer only when parent/child sequencing is required

Flows add ordering guarantees; use them only when child jobs must complete before the parent continues.

```typescript
import { FlowProducer } from "bullmq";
const flow = new FlowProducer({ connection: jobsRedis });
// parent waits for all children before processing
```

## DLQ is the failed set — retained 7 days, alerted at threshold

Failed jobs older than 1 hour with no remaining retries trigger an alert. The failed set is the DLQ; inspect it in bull-board.

```typescript
worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, queue: worker.name, err }, "job failed");
  // wire metric increment here; alert when failed-count-over-1h exceeds threshold
});
```

## Mount bull-board on Hono `/admin/queues` behind admin auth

`@bull-board/hono` + `HonoAdapter` serve the UI. Pass Bun's `serveStatic` from `hono/bun`. Guard the route with admin auth middleware.

```typescript
// src/server/admin.ts
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { serveStatic } from "hono/bun";
import { Hono } from "hono";
import { queue as invoiceQueue } from "@/modules/invoice/jobs";
import { adminAuthMiddleware } from "@/middleware/auth";

const serverAdapter = new HonoAdapter(serveStatic);

createBullBoard({
  queues: [new BullMQAdapter(invoiceQueue)],
  serverAdapter,
});

const basePath = "/admin/queues";
serverAdapter.setBasePath(basePath);

export const adminApp = new Hono();
adminApp.use(adminAuthMiddleware);
adminApp.route(basePath, serverAdapter.registerPlugin());
```

## Graceful shutdown closes workers within 30 seconds

`SIGTERM`/`SIGINT` → stop accepting requests → drain in-flight → close workers → close DB and Redis → exit.

`server.stop()` stops accepting connections and resolves once in-flight requests finish. `server.stop(true)` force-closes them instead — only use it after the drain budget is spent.

```typescript
// src/server/index.ts
import { workers } from "@/server/jobs";
import { sql } from "@/server/db";
import { closeL2 } from "@/server/lib/cache/l2";
import { jobsRedis } from "@/server/lib/redis";
import { logger } from "@/server/lib/logger";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down");

  const hardExit = setTimeout(() => {
    logger.error("shutdown: hard exit at 45s");
    process.exit(1);
  }, 45_000);
  hardExit.unref();

  // Drain: stop() resolves when in-flight requests finish; cap the wait at 10s
  await Promise.race([server.stop(), sleep(10_000)]);
  await server.stop(true); // force-close whatever survived the drain budget

  await Promise.race([Promise.all(workers.map((w) => w.close())), sleep(30_000)]);
  await sql.end();
  await closeL2();
  await jobsRedis.quit();

  clearTimeout(hardExit);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
```

## Test processors by calling them directly

Pass a fake job object — no Redis required. Test the processor function, not the queue.

```typescript
// modules/invoice/jobs.test.ts
import { describe, it, expect, mock } from "bun:test";
import { processor } from "./jobs";

describe("invoice processor", () => {
  it("skips already-sent invoice", async () => {
    const fakeJob = { data: { invoiceId: "inv_1" } } as any;
    // mock db to return sentAt already set
    await expect(processor(fakeJob)).resolves.toBeUndefined();
  });
});
```

## Split workers out of process only on stated triggers

Keep workers in-process behind `ROLE=all|worker` by default. Split to a separate process only when:
- Worker CPU is starving web-request latency.
- Workers need independent scaling or release cadence.

## Before you finish

| Check | Rule |
| --- | --- |
| Queue name is `domain.action` | Yes — e.g., `invoice.send`, `report.generate` |
| `jobId` passed in `enqueue()` | Caller supplies the idempotency key |
| `attempts: 3`, exponential `delay: 1000` | Exact values from `defaultJobOptions` |
| `removeOnComplete` age + count set | `{ age: 86400, count: 1000 }` |
| `removeOnFail` age set | `{ age: 604800 }` (7 days) |
| `concurrency` matches workload type | 5 default, 20 IO-bound, 1 CPU-bound |
| `lockDuration: 30000` | Set on every worker |
| Idempotency check before side effects | Read `processedAt`/status before acting |
| `jobId` contains no `:` | BullMQ reserves the colon — use `invoice-${id}` |
| DB marker guards the side effect, not `jobId` alone | Queue dedup ends when the job is removed |
| No network call inside `db.transaction` | Claim in tx, send after commit, then mark sent |
| Job data carries `orgId` | Processor runs `set_config('app.org_id', ..., true)` in the tx |
| Graceful drain uses `server.stop()` first | `stop(true)` only after the 10s budget |
| `UnrecoverableError` for permanent failures | Not retried, goes to failed set |
| `maxRetriesPerRequest: null` on jobs ioredis | Required for BullMQ blocking |
| Workers registered only for `ROLE=all\|worker` | `registerWorkers()` checks `env.ROLE` |
| bull-board behind admin auth | `adminAuthMiddleware` guards the route |
| Graceful shutdown within 30s | `w.close()` called, 45s hard exit |
