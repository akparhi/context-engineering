<!-- Adapted from wondelai/skills, wshobson/agents, addyosmani/agent-skills (MIT). See NOTICE.md -->

# Architecture reference

Scope: single-deployable Bun + Hono + oRPC v2 + Drizzle v1 + BullMQ application. All values here are exact; apply them without alternatives.

## Single-deployable directory tree

```
src/
  server/
    index.ts          Bun.serve entry; SIGTERM handler; hard-exit timer
    app.ts            Hono instance; route order; middleware chain
    rpc/
      index.ts        assembles all module routers into one oRPC router
    modules/
      <feature>/
        table.ts      Drizzle schema only
        queries.ts    Drizzle queries only — no rules
        service.ts    business rules; receives db | tx as first arg
        router.ts     oRPC router — translate only; no rules
        jobs.ts       BullMQ queue, enqueue(), processor
        *.test.ts     tests beside the code they test
    db/
      index.ts        postgres-js pool + drizzle(sql) instance
      migrate.ts      migrate() under pg_advisory_lock before serve
    jobs/
      index.ts        registers workers when ROLE is "all" or "worker"
    lib/
      ports/          port interfaces (NotificationPort, EmailPort, …)
      adapters/       vendor implementations of ports
    env/
      server.ts       @t3-oss/env-core; throws in browser
      client.ts       @t3-oss/env-core; clientPrefix "VITE_"
  client/             Vite SPA source
  shared/             contract types shared by server and client
```

## Feature module file set

Each feature owns exactly these files; add only when the concern exists.

| File | Allowed imports | Forbidden |
|---|---|---|
| `table.ts` | `drizzle-orm/pg-core`, `zod` | services, queries, routers |
| `queries.ts` | `table.ts`, `drizzle-orm`, `db/index.ts` | services, routers, ports |
| `service.ts` | `queries.ts`, `lib/ports/*`, `shared/**` | routers, Hono, oRPC internals |
| `router.ts` | `service.ts`, `@orpc/server`, `env/server.ts` | `queries.ts` directly, DB pool |
| `jobs.ts` | `service.ts`, `bullmq` | routers |

No `utils/` directories. No `*Service` suffix on class or file names.

## Layer roles

**`router.ts` translates only.** Input arrives from oRPC context → call service → return result or throw a typed error. No Drizzle imports, no direct DB pool access.

**`service.ts` decides.** All business rules live here. First parameter is always `db | tx` — never instantiate a transaction inside a service; the caller provides it.

**`queries.ts` is Drizzle only.** Returns raw rows or aggregates. No conditions that encode rules. No calls outside `drizzle-orm` and the table definition.

## Ports in `lib/ports/`, adapters in `lib/adapters/`

Define a port interface for every external vendor (email, SMS, payment, storage).

```ts
// lib/ports/notification.ts
export interface NotificationPort {
  send(to: string, template: string, data: Record<string, unknown>): Promise<void>;
}

// lib/adapters/resend-notification.ts
import type { NotificationPort } from "../ports/notification";

export class ResendNotification implements NotificationPort {
  async send(to, template, data) { /* Resend SDK call */ }
}
```

Wire the adapter at the edge (`app.ts` or DI bootstrapper). Services import the port type, never the adapter.

## Import boundary rules

- `src/client/**` must not import anything under `src/server/**`.
- `src/server/modules/**` must not import other modules' `service.ts` or `queries.ts` directly — go through the port layer or compose at the router level.
- `src/shared/**` is importable everywhere; it must not import from `src/server/**` or `src/client/**`.
- `env/server.ts` is forbidden in `src/client/**` (enforced by oxlint `no-restricted-imports`).

## Split triggers

Keep everything in one process. Split only when one of these is true:

1. Worker CPU saturates and measurably degrades request p99 latency.
2. Workers and the web server need independent horizontal scaling.
3. Workers and the web server have separate release cadences.

Document the trigger in a comment at the call site when splitting.

## Transactional outbox recipe

Use the outbox to guarantee at-least-once delivery of side effects (emails, webhooks, queue jobs) that must not be lost on process crash.

```ts
// modules/outbox/table.ts
import { pgTable, uuid, text, timestamp, jsonb, integer } from "drizzle-orm/pg-core";

export const outboxEvents = pgTable("outbox_events", {
  id: uuid().primaryKey().$defaultFn(() => Bun.randomUUIDv7()),
  topic: text().notNull(),
  payload: jsonb().notNull(),
  attempts: integer().notNull().default(0),
  processedAt: timestamp({ withTimezone: true, mode: "string", precision: 3 }),
  createdAt: timestamp({ withTimezone: true, mode: "string", precision: 3 }).defaultNow().notNull(),
});

// In service.ts — insert event in the same transaction as the main write
await db.transaction(async (tx) => {
  await tx.insert(orders).values(order);
  await tx.insert(outboxEvents).values({
    topic: "order.created",
    payload: { orderId: order.id },
  });
});

// modules/outbox/jobs.ts — polling worker dispatches pending events
export async function pollOutbox(db: Db) {
  const pending = await db
    .select()
    .from(outboxEvents)
    .where(isNull(outboxEvents.processedAt))
    .orderBy(asc(outboxEvents.createdAt))
    .limit(100)
    .for("update", { skipLocked: true });

  for (const event of pending) {
    await dispatch(event); // enqueue into BullMQ or call handler
    await db
      .update(outboxEvents)
      .set({ processedAt: sql`now()`, attempts: event.attempts + 1 })
      .where(eq(outboxEvents.id, event.id));
  }
}
```

Schedule `pollOutbox` with `upsertJobScheduler` every 5 seconds. Idempotency key on the downstream job is the `outboxEvents.id`.

## Before you finish

| Check | Pass condition |
|---|---|
| No `utils/` or `common/` directories | All helpers live in a named feature or `lib/` |
| No `*Service` suffix | Filename is `service.ts`, export is a plain function or plain object |
| `queries.ts` has no `if` branching on business state | Rules belong in `service.ts` |
| Every vendor behind a port | No vendor SDK imported directly in `service.ts` |
| Outbox insert is in the same `tx` as the main write | Separate `insert` after `commit` is wrong |
| Split justified by a documented trigger | Comment present at the split point |
