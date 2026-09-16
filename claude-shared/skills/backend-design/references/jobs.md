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

Passing the same `jobId` twice does not create a second job. Derive `jobId` from domain identity (e.g., `invoice:${invoiceId}` or an external reference).

```typescript
await enqueue({ invoiceId }, `invoice:${invoiceId}`);
// Second call with same jobId is a no-op — BullMQ deduplicates
```

## Processor checks a status marker before side effects

Read a `processedAt` or status column before doing work. Write the completion marker in the same transaction as the outcome so partial processing is never silently swallowed.

```typescript
export async function processor(job: Job<InvoiceJobData>): Promise<void> {
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, job.data.invoiceId),
  });

  if (!invoice) throw new UnrecoverableError("invoice not found");
  if (invoice.sentAt) return; // already processed — idempotent exit

  await db.transaction(async (tx) => {
    await sendInvoiceEmail(invoice); // side effect
    await tx
      .update(invoices)
      .set({ sentAt: sql`now()` })
      .where(eq(invoices.id, invoice.id));
    // sentAt and email send are atomic — no partial state
  });
}
```

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

```typescript
// src/server.ts
import { workers } from "@/server/jobs";
import { sql } from "@/db";
import { cacheRedis, jobsRedis } from "@/lib/redis";
import { logger } from "@/lib/logger";

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down");
  server.stop(true); // stop accepting new requests
  await new Promise((r) => setTimeout(r, 10_000)); // drain 10s
  await Promise.all(workers.map((w) => w.close())); // 30s BullMQ timeout
  await sql.end();
  await cacheRedis.quit();
  await jobsRedis.quit();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
setTimeout(() => process.exit(1), 45_000).unref(); // hard exit
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
| Write marker in same transaction as outcome | Atomicity of marker + work |
| `UnrecoverableError` for permanent failures | Not retried, goes to failed set |
| `maxRetriesPerRequest: null` on jobs ioredis | Required for BullMQ blocking |
| Workers registered only for `ROLE=all\|worker` | `registerWorkers()` checks `env.ROLE` |
| bull-board behind admin auth | `adminAuthMiddleware` guards the route |
| Graceful shutdown within 30s | `w.close()` called, 45s hard exit |
