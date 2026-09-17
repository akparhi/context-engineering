<!-- Adapted from honra-io/drizzle-best-practices, ccheney/robust-skills, wshobson/agents, supabase/agent-skills (MIT). See NOTICE.md -->

Drizzle v1 (`drizzle-orm@rc`) schema recipes for Postgres 17/18: config, ids, types, keys, tenancy, relations, RLS, Zod derivation, file layout.

## Configure drizzle-kit once, with snake_case casing

`drizzle.config.ts` at the repo root. `casing: "snake_case"` lets every column keep its camelCase TS key and emit a snake_case column name.

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/modules/**/table.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

Pass the same `casing` to `drizzle()` at runtime, or the generated SQL and the query builder disagree.

Existing project casing wins. A codebase on `camelCase` stays on `camelCase`.

## Build the client with postgres-js and bounded pool values

Use the `postgres` package (postgres-js). `verify:` the Bun SQL driver has date-handling bugs in the reference project; postgres-js is the pinned driver until that is retested.

```ts
// src/server/db/client.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env/server";
import { relations } from "./relations";

const sql = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 5,
  connection: { statement_timeout: "10s" },
});

export const db = drizzle({ client: sql, relations, casing: "snake_case" });
export { sql };
```

`max: 10` is per process. Multiply by replica count before comparing against `max_connections`.

Prefer setting the timeouts on the app role so every connection inherits them, including psql and migrations:

```sql
ALTER ROLE app_user SET statement_timeout = '10s';
ALTER ROLE app_user SET idle_in_transaction_session_timeout = '10s';
```

The `connection: { statement_timeout: "10s" }` option above is the fallback when you cannot alter the role.

## Give every table a UUIDv7 primary key

```ts
id: uuid().primaryKey().$defaultFn(() => Bun.randomUUIDv7()),
```

UUIDv7 is time-ordered, so inserts stay at the right edge of the B-tree and index bloat stays low. Never `serial`. Never `defaultRandom()` (UUIDv4) on a hot insert path.

On Postgres 18 use the server-side default instead: `id: uuid().primaryKey().default(sql\`uuidv7()\`)`.

## Share timestamp and audit columns through spread helpers

All timestamps are `timestamp({ withTimezone: true, mode: "string", precision: 3 })`. `mode: "string"` keeps ISO strings across the wire without a `Date` round-trip; `precision: 3` matches millisecond JSON.

```ts
// src/server/db/columns.ts
import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../modules/user/table";

export const timestamps = {
  createdAt: timestamp({ withTimezone: true, mode: "string", precision: 3 })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ withTimezone: true, mode: "string", precision: 3 })
    .defaultNow()
    .notNull()
    .$onUpdate(() => sql`now()`),
};

export const timestampsWithDeletedAt = {
  ...timestamps,
  deletedAt: timestamp({ withTimezone: true, mode: "string", precision: 3 }),
};

export const auditActors = {
  createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
  updatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
};
```

Index `createdBy` and `updatedBy` in the table's index list; Postgres does not index referencing columns automatically.

## Pick the column type from the domain, not from convenience

| Domain value | Column | Note |
| --- | --- | --- |
| Any string | `text()` | Never `varchar(n)`; add `CHECK (length(col) <= n)` when a limit is real |
| Money | `bigint({ mode: "bigint" })` minor units + `char({ length: 3 })` currency | Never float, never a bare `numeric` amount without its currency |
| Rate, percentage, FX | `numeric({ precision: 12, scale: 6 })` | Exact decimal, arrives as string |
| Instant | `timestamp({ withTimezone: true, mode: "string", precision: 3 })` | Never `timestamp` without timezone |
| Schemaless payload | `jsonb().$type<T>()` | Must have a Zod schema validating it at the boundary |
| Closed set changing less than yearly | `pgEnum` | Otherwise a lookup table |
| Boolean | `boolean().notNull()` | Add a default; tri-state needs a real reason |

```ts
export const invoices = pgTable("invoices", {
  id: uuid().primaryKey().$defaultFn(() => Bun.randomUUIDv7()),
  orgId: uuid().notNull().references(() => orgs.id, { onDelete: "cascade" }),
  amountMinor: bigint({ mode: "bigint" }).notNull(),
  currency: char({ length: 3 }).notNull(),
  fxRate: numeric({ precision: 12, scale: 6 }),
  metadata: jsonb().$type<InvoiceMetadata>(),
  ...timestampsWithDeletedAt,
  ...auditActors,
});
```

`jsonb` is opaque to the planner. Anything you filter or sort on becomes a real column or a generated column, not a JSON path.

## Choose pgEnum only for sets that outlive a release cycle

`pgEnum` gives a database-enforced closed set and a TS union type:

```ts
export const invoiceStatus = pgEnum("invoice_status", ["draft", "sent", "paid", "void"]);
```

Postgres can add enum values but cannot remove them. A set that gains or loses members more than yearly becomes a lookup table with an FK, so values are rows you can insert, retire, and describe.

The reference project pairs each enum with a TS object through a `pgEnumToEnum` helper, so app code reads `InvoiceStatus.Paid` rather than a bare string literal.

## Index every foreign key and state onDelete on every one

Postgres creates no index for a referencing column. An unindexed FK makes every parent delete scan the child table and holds locks longer.

```ts
export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: uuid().primaryKey().$defaultFn(() => Bun.randomUUIDv7()),
    orgId: uuid().notNull().references(() => orgs.id, { onDelete: "cascade" }),
    invoiceId: uuid().notNull().references(() => invoices.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    index("invoice_items_org_invoice_idx").on(t.orgId, t.invoiceId),
  ],
);
```

`onDelete` choices: `cascade` for rows owned by the parent, `restrict` when deletion must fail, `set null` for optional references such as audit actors. Leaving it unstated gives `no action`, which surfaces as an opaque constraint error at runtime.

## Put orgId first and lead every composite index with it

In a multi-tenant schema `orgId` is the first column after `id` on every tenant-scoped table, and the leading column of every composite index. A tenant-scoped query then walks one index range instead of filtering after the fact.

```ts
(t) => [
  index("invoices_org_created_idx").on(t.orgId, t.createdAt.desc(), t.id.desc()),
  uniqueIndex("invoices_org_number_uq").on(t.orgId, t.number),
]
```

Uniqueness is always per tenant: `(orgId, number)`, never `number` alone.

`verify:` Drizzle docs note that `drizzle-kit` reads only the index name and `.on()` columns, so `.desc()` may not reach the generated DDL. Read the emitted SQL after `generate`; write the ordered index in a `--custom` migration when the `DESC` is missing.

## Filter soft deletes through a partial index

`deletedAt` nullable. Every read filters `isNull(table.deletedAt)`. Hard deletion happens only in a retention job.

```ts
(t) => [
  index("invoices_org_active_idx")
    .on(t.orgId, t.createdAt.desc())
    .where(sql`deleted_at is null`),
]
```

A unique constraint on a soft-deletable table must be partial, or a deleted row keeps blocking its own key:

```ts
(t) => [
  uniqueIndex("invoices_org_number_active_uq")
    .on(t.orgId, t.number)
    .where(sql`deleted_at is null`),
]
```

Drizzle emits `CREATE UNIQUE INDEX ... WHERE deleted_at IS NULL`. A plain `.unique()` column modifier cannot carry the predicate.

## Declare relations with defineRelations, once, in its own file

Drizzle v1 replaces `relations()` with `defineRelations`. `r.one` needs explicit `from`/`to`; `r.many` infers from the matching `r.one`. Both sides must exist for `db.query` to traverse in both directions.

```ts
// src/server/db/relations.ts
import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
  orgs: {
    invoices: r.many.invoices(),
    members: r.many.users({
      from: r.orgs.id.through(r.orgMembers.orgId),
      to: r.users.id.through(r.orgMembers.userId),
    }),
  },
  invoices: {
    org: r.one.orgs({ from: r.invoices.orgId, to: r.orgs.id }),
    items: r.many.invoiceItems(),
  },
  invoiceItems: {
    invoice: r.one.invoices({ from: r.invoiceItems.invoiceId, to: r.invoices.id }),
  },
  users: {
    orgs: r.many.orgs(),
  },
}));
```

`.through()` collapses a junction table, so many-to-many queries never name the junction. The junction table still exists in the schema with its composite primary key.

Pass `relations` into `drizzle({ client, relations })`, otherwise `db.query` has nothing to traverse.

## Enable RLS with pgTable.withRLS and carry the tenant in a setting

`.enableRLS()` is removed in v1. Use `pgTable.withRLS(...)` for a table with no policies (default-deny), and plain `pgTable` with a `pgPolicy` entry when you define policies — adding any policy enables RLS automatically.

```ts
import { sql } from "drizzle-orm";
import { pgPolicy, pgRole, pgTable, uuid } from "drizzle-orm/pg-core";

export const appUser = pgRole("app_user");

export const invoices = pgTable(
  "invoices",
  { /* columns */ },
  (t) => [
    pgPolicy("invoices_org_isolation", {
      for: "all",
      to: appUser,
      using: sql`${t.orgId} = current_setting('app.org_id', true)::uuid`,
      withCheck: sql`${t.orgId} = current_setting('app.org_id', true)::uuid`,
    }),
  ],
);

// RLS on, no policy: nothing is visible to app_user
export const auditLog = pgTable.withRLS("audit_log", { /* columns */ });
```

The request sets the tenant inside a transaction, so a pooled connection never leaks it:

```ts
await db.transaction(async (tx) => {
  await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
  return tx.select().from(invoices);
});
```

RLS applies to the connecting role. Superusers and roles with `BYPASSRLS` always bypass policies. Table owners bypass their own tables unless the table has `FORCE ROW LEVEL SECURITY`.

Connect the app as a role that is `NOSUPERUSER NOBYPASSRLS` and does not own the tables.

## Derive Zod schemas from tables, never hand-write them

Drizzle v1 ships the validators inside the ORM package. `drizzle-zod` is the v0 package and does not apply.

```ts
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";

export const invoiceSelect = createSelectSchema(invoices);
export const invoiceInsert = createInsertSchema(invoices, {
  currency: (s) => s.length(3).toUpperCase(),
}).omit({
  id: true,
  orgId: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  createdBy: true,
  updatedBy: true,
});
export const invoiceUpdate = createUpdateSchema(invoices).pick({ status: true });
```

`createInsertSchema` requires `notNull()` columns and drops generated ones. `createUpdateSchema` makes everything optional. `createSelectSchema` also works on a `pgEnum`, producing `z.enum([...])`.

Omit server-owned columns (`id`, timestamps, `orgId`, audit actors) from the insert schema so a client can never set them.

## Infer row types from the table, not from a parallel interface

```ts
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
```

`$inferSelect` includes defaulted and generated columns as required. `$inferInsert` makes defaulted columns optional. A hand-written `interface Invoice` drifts the first time a column changes.

## One table per file, one barrel for the schema glob

```
src/server/modules/invoice/table.ts     invoices, invoiceItems, invoiceStatus
src/server/modules/user/table.ts        users
src/server/db/schema.ts                 export * from every module table.ts
src/server/db/relations.ts              defineRelations over the barrel
src/server/db/columns.ts                timestamps, timestampsWithDeletedAt, auditActors
```

```ts
// src/server/db/schema.ts
export * from "../modules/invoice/table";
export * from "../modules/user/table";
export * from "../modules/org/table";
```

The barrel is what `defineRelations` consumes. `drizzle.config.ts` globs the module files directly, so a new module needs no config change — only a barrel line.

## Normalize to 3NF, denormalize only with a rebuild path

Default: every non-key column depends on the key, the whole key, and nothing but the key. One fact, one place.

Denormalize only when a measured read cost demands it, and only after declaring three things in the same commit:

1. Source of truth — the normalized table the copy derives from.
2. Staleness budget — how far behind the copy may run.
3. Rebuild path — the query or job that regenerates it from the source.

```ts
// yagni: counter maintained in the same transaction as the item write;
// rebuild: update invoices set item_count = (select count(*) from invoice_items ...)
itemCount: integer().notNull().default(0),
```

A denormalized column without a rebuild path is a bug waiting for its first inconsistency.

## Before you finish

| Detection | Fix |
| --- | --- |
| `serial()` or `.defaultRandom()` on a primary key | `uuid().primaryKey().$defaultFn(() => Bun.randomUUIDv7())` |
| `relations()` imported from `drizzle-orm` | `defineRelations(schema, (r) => ...)` in `db/relations.ts` |
| `drizzle-zod` in imports or `package.json` | `drizzle-orm/zod` |
| `.enableRLS()` chained on a table | `pgTable.withRLS("name", { ... })` |
| `varchar({ length: n })` for a free-text column | `text()`, plus a `CHECK` if the limit is real |
| Money stored as `numeric` or `real` | `bigint({ mode: "bigint" })` minor units + `char({ length: 3 })` currency |
| `timestamp()` without `withTimezone` | `timestamp({ withTimezone: true, mode: "string", precision: 3 })` |
| FK with no `.references(..., { onDelete })` | State the action: `cascade`, `restrict`, or `set null` |
| FK column absent from any index | Add an index leading with `orgId`, then the FK column |
| `.unique()` on a table carrying `deletedAt` | `uniqueIndex(...).where(sql\`deleted_at is null\`)` |
| Composite index not leading with `orgId` on a tenant table | Reorder so `orgId` is first |
| Hand-written `z.object` mirroring a table | `createInsertSchema` / `createSelectSchema` from `drizzle-orm/zod` |
| `interface Row { ... }` beside a table | `typeof table.$inferSelect` |
| `pgEnum` for a set that changes per release | Lookup table with an FK |
| Derived column with no stated rebuild path | Add the rebuild query in a comment, or drop the column |
| `casing` missing from `drizzle.config.ts` or `drizzle()` | Set `"snake_case"` in both, or match the project's existing casing |
