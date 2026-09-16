<!-- Adapted from pedronauck/skills, honra-io/drizzle-best-practices, supabase/agent-skills (MIT). See NOTICE.md -->

drizzle-kit v1 migration workflow on Postgres 17/18: generate and review, migrate at boot under a lock, expand/contract, backfills, concurrent indexes, enum evolution, seeds, rollback.

## Generate, review the SQL, commit it

```bash
bunx drizzle-kit generate            # diff schema against the last snapshot
bunx drizzle-kit generate --name add_invoice_status
bunx drizzle-kit check               # verify the journal is consistent
```

`generate` writes an `.sql` file plus a snapshot under `drizzle/meta/`. Both are committed together — the snapshot is how the next diff knows where it started.

Read the generated SQL before committing. Look for a rename rendered as `DROP` + `ADD` (data loss) and a `NOT NULL` added to a populated table (fails). Also look for an index on a large table (write lock) and a type change (table rewrite).

Never hand-edit a generated schema migration. Change the schema and regenerate. Hand-written SQL belongs in a `--custom` file, which is journal-tracked; a loose `.sql` dropped into `drizzle/` is not in `meta/_journal.json` and never runs.

Statements in a generated file are separated by `--> statement-breakpoint`. That marker is what the migrator splits on.

CI gate: run `generate` and fail if it produces a diff.

```yaml
- run: bunx drizzle-kit generate && git diff --exit-code drizzle/
```

`bunx drizzle-kit push` skips migration files and applies the schema directly. Development and throwaway databases only — never a shared or production database.

## Migrate at boot, under an advisory lock, before serving

Every replica runs the same startup path. The lock makes exactly one of them apply migrations while the rest wait, then serve.

```ts
// src/server/index.ts
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql as sqlTag } from "drizzle-orm";
import { app } from "./app";
import { db, sql } from "./db/client";
import { logger } from "./lib/logger";

const MIGRATE_LOCK = sqlTag`hashtext('migrate')`;

await db.execute(sqlTag`select pg_advisory_lock(${MIGRATE_LOCK})`);
try {
  await migrate(db, { migrationsFolder: "./drizzle" });
  logger.info("migrations applied");
} finally {
  await db.execute(sqlTag`select pg_advisory_unlock(${MIGRATE_LOCK})`);
}

const server = Bun.serve({ port: Bun.env.PORT ?? 3000, fetch: app.fetch });
logger.info({ port: server.port }, "listening");
```

`pg_advisory_lock` is session-scoped, so it must be unlocked explicitly — hence the `finally`. Use the session lock here, not `pg_advisory_xact_lock`, because `migrate()` runs its own transactions.

The lock must be held on a connection that outlives the migration. With `max: 10` postgres-js reuses connections; take the lock and run the migration on the same `db` handle as above.

## Expand and contract for every rename and every type change

A rolling deploy runs old and new code against one database. A rename that is one migration breaks whichever side is not yet deployed.

| Change | Release 1 (expand) | Release 2 | Release 3 (contract) |
| --- | --- | --- | --- |
| Rename `name` → `full_name` | Add `full_name` nullable; write both, read `name` | Backfill; read `full_name`, still write both | Stop writing `name`; drop it |
| `text` → `uuid` | Add `owner_id uuid` nullable; dual-write | Backfill and switch reads | Drop `owner_text` |
| Drop a column | Stop reading it in code | Ship and bake one release | Drop the column |
| Split a table | Create the new table; dual-write | Backfill and switch reads | Drop the old columns |

A column is dropped no earlier than two releases after the last code that reads it. The rollback target for release N is release N−1, and release N−1 must still run against the migrated database.

## Add nullable, backfill in batches, then tighten

Adding a `NOT NULL` column without a default to a populated table fails. A volatile default (`now()`, `gen_random_uuid()`) rewrites the table under `ACCESS EXCLUSIVE`. Three steps instead:

**Step 1 — add nullable.** Regular `generate`, no lock risk.

```sql
ALTER TABLE invoices ADD COLUMN currency char(3);
```

**Step 2 — backfill in batches** in a `--custom` migration. One statement per `1000` rows, looped, so no single statement holds a long lock.

```bash
bunx drizzle-kit generate --custom --name backfill_invoice_currency
```

```sql
-- drizzle/0014_backfill_invoice_currency.sql
DO $$
DECLARE
  updated integer;
BEGIN
  LOOP
    UPDATE invoices SET currency = 'AED'
    WHERE id IN (
      SELECT id FROM invoices WHERE currency IS NULL LIMIT 1000
    );
    GET DIAGNOSTICS updated = ROW_COUNT;
    EXIT WHEN updated = 0;
    COMMIT;
  END LOOP;
END $$;
```

The backfill is idempotent — it targets only `currency IS NULL`, so a re-run is a no-op.

`verify:` `COMMIT` inside a `DO` block requires a procedure-style block and fails when the block itself runs inside a transaction. If the migrator wraps each file in a transaction, run the loop as a one-off operational script against the same database instead, then ship step 3.

**Step 3 — tighten without a full-table lock.** A direct `SET NOT NULL` scans the whole table under a strong lock. `CHECK ... NOT VALID` then `VALIDATE CONSTRAINT` takes only a `SHARE UPDATE EXCLUSIVE` lock during the scan.

```sql
ALTER TABLE invoices ADD CONSTRAINT invoices_currency_not_null
  CHECK (currency IS NOT NULL) NOT VALID;
--> statement-breakpoint
ALTER TABLE invoices VALIDATE CONSTRAINT invoices_currency_not_null;
--> statement-breakpoint
ALTER TABLE invoices ALTER COLUMN currency SET NOT NULL;
--> statement-breakpoint
ALTER TABLE invoices DROP CONSTRAINT invoices_currency_not_null;
```

On Postgres 12+ a validated `CHECK (col IS NOT NULL)` lets `SET NOT NULL` skip its own scan, so the last two statements are cheap.

The backfill migration must be ordered before the tightening migration in `drizzle/meta/_journal.json`. Generate the custom file first, then the schema file.

## Build large indexes concurrently, outside `migrate()`

`CREATE INDEX` takes a write lock for the whole build. `CREATE INDEX CONCURRENTLY` does not, but it cannot run inside a transaction block. `migrate()` runs every pending file inside one transaction, so a concurrent build in a migration file fails.

Four steps for any table over `1M` rows:

1. Declare the index in `table.ts` as usual.
2. Run `bunx drizzle-kit generate`, then edit the generated statement to `CREATE INDEX IF NOT EXISTS`.
3. Before deploying, build it from an ops script with no transaction:

```ts
// scripts/db-ops.ts — runs one statement outside any transaction
import postgres from "postgres";
import { env } from "../src/server/env/server";

const sql = postgres(env.DATABASE_URL, { max: 1 });
await sql.unsafe(process.argv[2]!);
await sql.end();
```

```bash
bun scripts/db-ops.ts "CREATE INDEX CONCURRENTLY IF NOT EXISTS invoices_org_created_idx ON invoices (org_id, created_at DESC, id DESC)"
```

4. Deploy. `migrate()` runs the `IF NOT EXISTS` statement as a no-op.

A `CONCURRENTLY` build that fails leaves an invalid index. Detect and clean up:

```sql
SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
DROP INDEX CONCURRENTLY invoices_org_created_idx;
```

## Add enum values one release before using them; never plan to remove one

`ALTER TYPE ... ADD VALUE` runs inside a transaction, but the new value is unusable until commit. `migrate()` runs all pending files in one transaction, so a default or backfill using the value in the same run fails.

```sql
-- drizzle/0016_invoice_status_add_refunded.sql
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'refunded';
```

Nothing else in that file. Code that writes `'refunded'` ships in the release after the migration lands.

Postgres cannot remove an enum value. Removal means creating a new type, migrating every column, and dropping the old type — a full expand/contract cycle.

A set that gains or loses members more than yearly is not an enum. Use a lookup table with an FK: values become rows you insert, retire with a flag, and describe.

## Add foreign keys NOT VALID, then validate

Adding an FK to a populated table scans the whole child table under a lock. Split it:

```sql
ALTER TABLE invoice_items
  ADD CONSTRAINT invoice_items_invoice_id_fk
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
  NOT VALID;
--> statement-breakpoint
ALTER TABLE invoice_items VALIDATE CONSTRAINT invoice_items_invoice_id_fk;
```

`NOT VALID` enforces the constraint on new rows immediately and skips the scan. `VALIDATE CONSTRAINT` checks existing rows under a weaker lock.

Index the referencing column in the same release — Postgres does not, and an unindexed FK makes parent deletes scan the child table.

## Seed idempotently, in one script, runnable any number of times

```ts
// src/server/db/seed.ts
import { db, sql } from "./client";
import { billingPlans } from "./schema";
import { logger } from "../lib/logger";

const PLANS = [
  { code: "free", name: "Free", monthlyMinor: 0n },
  { code: "pro", name: "Pro", monthlyMinor: 4900n },
];

await db
  .insert(billingPlans)
  .values(PLANS)
  .onConflictDoUpdate({
    target: billingPlans.code,
    set: { name: sql`excluded.name`, monthlyMinor: sql`excluded.monthly_minor` },
  });

logger.info({ count: PLANS.length }, "seeded billing plans");
await sql.end();
```

Run with `bun src/server/db/seed.ts`. Seeds carry reference data only — plans, roles, feature flags, country codes. Demo and test fixtures live in test setup, never in the seed.

A seed that fails on a second run is broken. Every write is an upsert keyed on a natural unique column.

## Roll forward; the inverse migration is the rollback

Migration history is append-only. `drizzle-kit` has no `down` command, and a `down` that reverses a data migration cannot restore what it deleted.

When a migration is wrong:

1. Write a new migration that reverses the schema change.
2. Ship it. It appends to the journal like any other.

This works because expand/contract already guarantees that release N−1 runs against the release-N schema. If it does not, the deploy was not expand/contract and the only real recovery is point-in-time restore.

Deleting a row from `__drizzle_migrations` to "re-run" a migration desynchronizes the journal from the database. Do not.

Take a snapshot before any migration that drops a column, drops a table, or rewrites data. That snapshot is the rollback for the cases a forward migration cannot cover.

## Migration checklist

| Check | Pass condition |
| --- | --- |
| Generated SQL reviewed | Read line by line; no unintended `DROP`, no surprise rewrite |
| Rename rendered as DROP + ADD | Rewritten as expand/contract across releases |
| New `NOT NULL` column | Added nullable, backfilled in `1000`-row batches, tightened via `CHECK ... NOT VALID` |
| Backfill ordering | Custom backfill file has a lower index than the tightening file in `meta/_journal.json` |
| Backfill idempotent | Re-running changes nothing; predicate targets only unmigrated rows |
| Index on a large table | Built via `scripts/db-ops.ts` with `CONCURRENTLY` before deploy; migration statement edited to `IF NOT EXISTS` |
| Enum change | `ALTER TYPE ... ADD VALUE IF NOT EXISTS` in one release; first use of the value in the next; no removals planned |
| New foreign key | Added `NOT VALID`, validated separately, referencing column indexed |
| Column drop | Two releases after the last code that reads it |
| Journal and snapshots | `drizzle/meta/_journal.json` and the snapshot committed with the `.sql` |
| `push` used | Never against a shared or production database |
| Applied in staging first | Same migration ran clean against production-shaped data |
| Row counts | Verified before and after every backfill |
| Snapshot taken | Before any drop or data rewrite |
| CI check | `drizzle-kit generate` produces no diff |

## Before you finish

| Detection | Fix |
| --- | --- |
| Generated `.sql` edited by hand | Revert; change the schema and regenerate |
| Loose `.sql` added to `drizzle/` without `generate --custom` | Regenerate through `--custom` so it lands in `meta/_journal.json` |
| `push` in a deploy script or CI job | `generate` + `migrate`; `push` is dev-only |
| `migrate()` called without an advisory lock | Wrap in `pg_advisory_lock(hashtext('migrate'))` with an unlock in `finally` |
| `migrate()` called after `Bun.serve` | Move it before; the server must not accept traffic on an old schema |
| `ALTER TABLE ... RENAME COLUMN` in a migration | Expand/contract: add, dual-write, backfill, switch reads, drop |
| `ADD COLUMN ... NOT NULL` on a populated table | Add nullable → batched backfill → `CHECK ... NOT VALID` → `VALIDATE` → `SET NOT NULL` |
| Backfill as a single unbounded `UPDATE` | Loop `1000` rows per statement with an `EXIT WHEN` on zero rows |
| `CREATE INDEX` without `CONCURRENTLY` on a table over `1M` rows | Build via `scripts/db-ops.ts` first; edit the migration statement to `IF NOT EXISTS` |
| `ALTER TYPE ... ADD VALUE` and a statement using the value in the same deploy | Split across two releases |
| Code writing a new enum value in the same release as the `ADD VALUE` | Split across two releases |
| `ADD CONSTRAINT ... FOREIGN KEY` without `NOT VALID` on a large table | Add `NOT VALID`, then `VALIDATE CONSTRAINT` |
| Column dropped in the same release code stopped reading it | Wait one more release |
| Seed script failing on a second run | Convert every write to `onConflictDoUpdate` on a natural key |
| A `down` migration file | Delete it; write the inverse forward migration instead |
| Row deleted from `__drizzle_migrations` | Restore the row; resolve the drift with a forward migration |
