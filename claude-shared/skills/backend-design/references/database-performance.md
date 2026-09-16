<!-- Adapted from supabase/agent-skills, wshobson/agents, ccheney/robust-skills, honra-io/drizzle-best-practices (MIT). See NOTICE.md -->

Postgres 17/18 + Drizzle v1 (`drizzle-orm@rc`) read path: indexing, plan reading, keyset pagination, N+1, transactions, pooling, timeouts, slow-query logging.

## Index every FK and every column a hot query filters or sorts on

Postgres indexes primary keys and unique constraints. It indexes nothing else — not foreign keys, not `WHERE` columns, not `ORDER BY` columns.

| Situation | Index |
| --- | --- |
| Foreign key column | B-tree, leading with `orgId` on a tenant table |
| Multi-column filter | Composite, column order = equality → range → sort |
| Query selects a few extra columns | Covering: `INCLUDE (a, b)` for an index-only scan |
| Query always filters a subset | Partial: `WHERE deleted_at IS NULL` |
| `jsonb` containment, `text[]` membership | GIN; `jsonb_path_ops` when only `@>` is used |
| Case-insensitive lookup | Expression index on `lower(col)`; the query must use `lower(col)` too |
| Low-cardinality column alone (`status`, `is_active`) | None — only as part of a composite or a partial predicate |

Composite column order is the whole game. `(orgId, status, createdAt)` serves `orgId = ? AND status = ? ORDER BY createdAt DESC`. It does not serve `status = ?` alone — the leftmost-prefix rule.

```ts
import { index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

(t) => [
  // equality, equality, sort
  index("invoices_org_status_created_idx").on(t.orgId, t.status, t.createdAt.desc()),
  // partial: only live rows
  index("invoices_org_active_idx")
    .on(t.orgId, t.createdAt.desc())
    .where(sql`deleted_at is null`),
  // GIN over jsonb containment only
  index("invoices_metadata_gin").using("gin", t.metadata.op("jsonb_path_ops")),
]
```

Non-btree methods use `.using(method, ...columns)`. There is no `.on(col).using(method)` chain. The builder chain is `.on(...).concurrently().where(sql\`\`).with({ fillfactor: '70' })`.

Drizzle has no builder for `INCLUDE`. Write a covering index as raw SQL in a `--custom` migration and keep the query aligned with it:

```sql
CREATE INDEX invoices_org_status_cover_idx
  ON invoices (org_id, status) INCLUDE (amount_minor, currency);
```

`verify:` Drizzle docs note that `drizzle-kit` reads only the index name and `.on()` columns, so `ASC`/`DESC`, `NULLS FIRST`, and `.concurrently()` may not reach the generated DDL. Check the emitted SQL after `generate`; add the ordering by hand in a `--custom` migration when it is missing.

An index that no query uses still costs every write. Drop what `pg_stat_user_indexes` reports with `idx_scan = 0` after a full traffic cycle.

## Read plans with EXPLAIN (ANALYZE, BUFFERS)

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, amount_minor FROM invoices
WHERE org_id = $1 AND status = 'sent'
ORDER BY created_at DESC LIMIT 50;
```

`EXPLAIN ANALYZE` executes the query, including writes. Run it in a transaction you roll back, or against a copy.

Checklist, in order:

1. **Seq Scan on a large table.** Fine under a few thousand rows. Above that, the filter columns need an index.
2. **Rows estimate off by more than 10x.** Compare `rows=` (estimate) to `actual rows=`. A large gap means stale statistics (`ANALYZE table`) or a correlated predicate the planner cannot model.
3. **Sort spilling to disk.** `Sort Method: external merge Disk: NNNkB` means the sort exceeded `work_mem`. Either index the sort order or raise `work_mem` for that session.
4. **`Buffers: read=` high relative to `hit=`.** The working set is not cached; expect disk-bound latency.
5. **`Rows Removed by Filter` large.** The index found rows the filter then discarded — the predicate belongs in the index, as a trailing column or a partial `WHERE`.
6. **Nested Loop with a large outer side.** Usually a missing index on the inner side's join column.

`Index Only Scan` is the target for hot reads. It requires every selected column to be in the index key or its `INCLUDE` list, and the visibility map to be current (`VACUUM`).

## Paginate by keyset, never by offset

`OFFSET n` scans and discards `n` rows. Page 10,000 costs 10,000 times page 1. Keyset over `(createdAt desc, id desc)` costs the same at any depth.

```ts
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";

type Cursor = { createdAt: string; id: string };

export function listInvoices(db: Db, orgId: string, cursor?: Cursor, limit = 50) {
  return db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.orgId, orgId),
        isNull(invoices.deletedAt),
        cursor
          ? or(
              lt(invoices.createdAt, cursor.createdAt),
              and(eq(invoices.createdAt, cursor.createdAt), lt(invoices.id, cursor.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(invoices.createdAt), desc(invoices.id))
    .limit(Math.min(limit, 100));
}
```

The tiebreaker on `id` is mandatory. Without it, rows sharing a `createdAt` are skipped or repeated across pages.

The cursor crosses the wire as opaque `base64url` JSON of `{ createdAt, id }`. `limit` defaults to `50`, caps at `100`.

The supporting index is the sort order: `(org_id, created_at DESC, id DESC)`. Confirm `drizzle-kit generate` emitted the `DESC`; if it did not, write that index in a `--custom` migration.

Offset is allowed only for admin tables known to stay under `10k` rows.

## Kill N+1 with one relational query or one inArray

A loop that queries per row is the most common latency bug. Two fixes, both single-round-trip:

```ts
// Relational query: db.query with `with`
const rows = await db.query.invoices.findMany({
  where: { orgId: { eq: orgId } },
  columns: { id: true, amountMinor: true, currency: true },
  with: { items: { columns: { id: true, description: true } } },
  limit: 50,
});

// Or: fetch parents, then children in one inArray, then group in memory
const parents = await db.select().from(invoices).where(eq(invoices.orgId, orgId)).limit(50);
const children = await db
  .select()
  .from(invoiceItems)
  .where(inArray(invoiceItems.invoiceId, parents.map((p) => p.id)));
```

`db.query` requires `relations` passed into `drizzle({ client, relations })`.

Select only the columns you use. `select()` with no argument fetches every column, including wide `text` and `jsonb` that TOAST-detoast on read.

```ts
db.select({ id: invoices.id, amountMinor: invoices.amountMinor }).from(invoices);
```

## Keep transactions under 100ms and free of network calls

A transaction holds locks for its whole life. An HTTP call inside one turns a 2ms lock into a 2-second lock.

Rules:

- The service function receives `tx` as its first argument and passes it to every statement. A query through the outer `db` handle escapes the transaction silently.
- Validate input, call external APIs, and compute before `BEGIN`. Inside, only read-modify-write.
- Target under `100ms`. Above that, split the work or move it to a job.
- Default isolation is read committed. That is correct for most work.

```ts
export async function payInvoice(tx: Tx, invoiceId: string, orgId: string) {
  const [row] = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, orgId)))
    .for("update");
  if (!row) throw new NotFound("invoice");
  await tx.update(invoices).set({ status: "paid" }).where(eq(invoices.id, invoiceId));
}
```

`FOR UPDATE` on any row carrying a balance or a running total — it serializes concurrent writers on that row instead of losing one update.

Singleton work (a nightly rollup, a leader-only task) takes a transaction-scoped advisory lock. It releases on commit or rollback, so a crashed process cannot hold it:

```ts
await db.transaction(async (tx) => {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('job:daily-rollup'))`);
  await runRollup(tx);
});
```

Escalate to `SERIALIZABLE` only when correctness depends on a read the transaction did not lock — a check-then-insert, a constraint spanning rows. Serializable transactions abort with SQLSTATE `40001`; the caller must retry the whole transaction, up to 3 attempts, with jittered backoff. A retry loop is part of the contract, not optional.

## Size the pool per process and count it against max_connections

```ts
const sql = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 5,
});
```

Total connections = `max` × processes per replica × replicas. Ten replicas at `max: 10` is 100 connections before migrations, psql, or a worker role. Compare against `max_connections` (commonly 100) and leave headroom.

Behind PgBouncer or any pooler in transaction mode:

- No session state. `SET` leaks onto whichever client reuses the connection. Use `SET LOCAL` inside a transaction, always.
- postgres-js prepares statements by default, which breaks in transaction mode unless the pooler tracks them. PgBouncer 1.21+ handles protocol-level prepared statements with `max_prepared_statements = 200`; otherwise set `prepare: false`.
- Session-level advisory locks, temp tables, and `LISTEN/NOTIFY` must stay inside one transaction.

## Set the tenant with SET LOCAL inside the transaction

RLS reads the tenant from a runtime setting. A plain `SET` outlives the request on a pooled connection and leaks one tenant's context into another's query.

```ts
export function withOrg<T>(orgId: string, fn: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    return fn(tx);
  });
}
```

The `true` third argument to `set_config` is what makes it transaction-local — the function form of `SET LOCAL`.

Connect as a non-owner role. Table owners and superusers bypass RLS unless the table has `FORCE ROW LEVEL SECURITY`.

## Bound every statement and every lock wait

Set on the app role so migrations, psql, and the app all inherit:

```sql
ALTER ROLE app_user SET statement_timeout = '10s';
ALTER ROLE app_user SET idle_in_transaction_session_timeout = '10s';
ALTER ROLE app_user SET lock_timeout = '3s';
```

`statement_timeout` caps a runaway query. `idle_in_transaction_session_timeout` kills a transaction whose client stalled while holding locks. `lock_timeout` fails fast instead of queueing behind a long DDL.

Override downward for a known-heavy read: `SET LOCAL statement_timeout = '30s'` inside its transaction.

## Log any query over 200ms at warn, with the SQL text and param count

Never the parameter values — they carry PII, tokens, and card data.

```ts
import type { Logger } from "drizzle-orm/logger";
import { logger } from "../lib/logger";

const SLOW_QUERY_MS = 200;

class SlowQueryLogger implements Logger {
  logQuery(query: string, params: unknown[]): void {
    const start = performance.now();
    queueMicrotask(() => {
      const durationMs = performance.now() - start;
      if (durationMs > SLOW_QUERY_MS) {
        logger.warn({ query, paramCount: params.length, durationMs }, "slow query");
      }
    });
  }
}

export const db = drizzle({ client: sql, relations, logger: new SlowQueryLogger() });
```

`verify:` Drizzle's `Logger.logQuery` fires before execution and receives no duration, so the microtask above measures scheduling, not query time. For true durations wrap the driver instead — postgres-js `onnotice`/debug hooks, or time the call site in `queries.ts`.

`pg_stat_statements` is the server-side counterpart. Order by `mean_exec_time` to find the worst repeat offenders regardless of which process issued them.

## Cache reads explicitly, never globally

Drizzle's cache is opt-in per query. A global cache silently serves stale rows to writes-adjacent reads.

```ts
const db = drizzle({
  client: sql,
  relations,
  cache: upstashCache({ url: env.REDIS_URL, token: env.REDIS_TOKEN }),
});

const plans = await db.select().from(billingPlans).$withCache({ config: { ex: 3600 } });
```

Drizzle cache is opt-in by default (`global: false`); call `.$withCache()` per query and never set `global: true`.

Never cache a row read under `FOR UPDATE`, a money balance, or an authorization decision beyond `5m`.

## Before you finish

| Detection | Fix |
| --- | --- |
| `.offset(n)` on a user-facing list | Keyset over `(createdAt desc, id desc)` with an `id` tiebreaker |
| Keyset `or()` missing the `id` tiebreaker | `or(lt(createdAt, c.createdAt), and(eq(createdAt, c.createdAt), lt(id, c.id)))` |
| `limit` unbounded or above `100` | `Math.min(limit, 100)`, default `50` |
| `await` inside a `for` loop over rows | `db.query` with `with`, or one `inArray` query |
| `.select()` with no column object on a wide table | `select({ ... })` naming only the columns used |
| FK column with no index | Composite index leading with `orgId`, then the FK |
| Composite index ordered sort-first | Reorder: equality → range → sort |
| `fetch`, HTTP client, or queue call inside `db.transaction` | Move it before `BEGIN` or after `COMMIT` |
| Transaction body querying `db` instead of `tx` | Thread `tx` through every statement |
| Balance or counter update without `.for("update")` | Add `FOR UPDATE` on the row |
| `SERIALIZABLE` with no retry on SQLSTATE `40001` | Wrap in a 3-attempt retry with jittered backoff |
| Singleton job with no lock | `pg_advisory_xact_lock(hashtext('job:<name>'))` inside the transaction |
| `SET app.org_id` outside a transaction | `set_config('app.org_id', $1, true)` inside `db.transaction` |
| `max` unset or above `10` per process | `max: 10`, `idle_timeout: 30`, `connect_timeout: 5`; recheck against `max_connections` |
| postgres-js behind transaction-mode PgBouncer with `prepare` unset | `prepare: false`, or PgBouncer 1.21+ with `max_prepared_statements = 200` |
| No `statement_timeout` on the app role | `ALTER ROLE app_user SET statement_timeout = '10s'` |
| Query params in a log line | Log SQL text and `params.length` only |
| Drizzle cache enabled with `global: true` | Opt in per query with `.$withCache()` |
| `EXPLAIN` without `ANALYZE, BUFFERS` when diagnosing | `EXPLAIN (ANALYZE, BUFFERS)`, in a rolled-back transaction |
