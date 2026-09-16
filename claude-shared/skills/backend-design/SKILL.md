---
name: backend-design
description: Use when designing or reviewing a backend feature, API, schema, migration, background job, cache, auth flow, or server entry point in a TypeScript, Bun or Postgres codebase. Also for oRPC routers, Drizzle tables, BullMQ queues, request logging, env handling, and pagination. Also when asked for a backend review.
---

<!-- Compiled from oRPC official skills, addyosmani/agent-skills, wondelai/skills, wshobson/agents, ccheney/robust-skills, honra-io/drizzle-best-practices, supabase/agent-skills, pedronauck/skills, sickn33/agentic-awesome-skills, honojs/skills, oxc-project/oxc (MIT). See NOTICE.md -->

# Backend design

Rules and exact values for backends that stay correct under retries, crashes and load. Read the section for the task at hand, then open the linked reference for the recipe.

Every timeout, TTL, attempt count, threshold and column type below is a specific value, not a range to approximate. `200ms` is not `250ms`. Use what is written.

Stack: Bun ≥ 1.2, Hono 4, oRPC v2 (`@orpc/*` 2.x), Zod 4, Postgres 17/18 with Drizzle v1 (`drizzle-orm@rc`), postgres-js, BullMQ 5 with ioredis, pino 10, oxlint and oxfmt. This skill assumes that stack table; where a project differs, keep the project's choice and apply the rule through it.

The global `~/.claude/CLAUDE.md` already states the generic standards: dependencies point inward, business rules in the model, idempotent retries, versioned contracts, validate at boundaries. Do not restate them. This skill states only the stack-specific rules and their values.

## Workflow

1. Ground: read `package.json`, `drizzle.config.ts`, `src/server/env/*`, the existing module layout, and how `ROLE` or the deploy target splits web from worker.
2. Design: name the feature module boundary, the tables and indexes, the procedure contract, the jobs it enqueues, and the cache keys it reads and invalidates.
3. Build: apply each section below inside the project's conventions, opening the linked reference for the recipe.
4. Check: run the `## Before you finish` table over the diff. Fix every hit.
5. Report: for reviews, use `## Reporting`. For builds, list what was verified and what was not.

## Architecture

One deployable by default, organised by feature. Recipes in [references/architecture.md](references/architecture.md).

### One process serves API, admin and SPA
Hono on `Bun.serve` serves `/rpc/*`, `/api/*` (OpenAPI), `/admin/queues`, `/health`, and the built SPA. BullMQ workers run in-process behind `ROLE=all|web|worker`.

### Split only on a stated trigger
Extract a worker process only when worker CPU starves request latency, when scaling needs diverge, or when release cadence must differ. Name the trigger in the change.

### Feature modules, not type folders
`src/server/{index.ts,app.ts,rpc/,modules/<feature>/,db/,jobs/,lib/,env/}`, plus `src/client/**` and `src/shared/**`. No `utils/`, no `common/`, no `*Service` suffix.

### Each module holds the same six files
`table.ts`, `queries.ts`, `service.ts`, `router.ts`, `jobs.ts`, `*.test.ts`. A feature spanning more files is two features.

### Routers translate, services decide, queries only query
`router.ts` maps input to a service call and a typed error. `service.ts` owns the rules and takes `db | tx` as its first argument. `queries.ts` is Drizzle only, no rules.

### Vendors sit behind a port
Port interface in `lib/ports/`, adapter in `lib/adapters/`. Services import the port. Mailer, payments, storage and clock all follow this.

### Outbox for side effects that must survive a crash
Insert the `outbox_events` row in the same transaction as the write; a poller dispatches it. The downstream job's idempotency key is `outboxEvents.id`.

## Server runtime

Boot order, route order, env split, shutdown. Recipes in [references/server-runtime.md](references/server-runtime.md).

### Migrate before serving
`migrate()` runs at boot under `pg_advisory_lock(hashtext('migrate'))`, then `Bun.serve` starts. Never serve traffic against an unmigrated schema.

### Static assets are immutable, `index.html` is not
`serveStatic({ root: "./dist/client" })`. Hashed assets get `Cache-Control: public, max-age=31536000, immutable`; `index.html` gets `no-cache`. A fallback route serves `index.html` for non-API GETs.

### Server env and client env are two modules
`@t3-oss/env-core` with `emptyStringAsUndefined: true` and explicit `runtimeEnv`. `env/server.ts` throws when `typeof window !== "undefined"`; `env/client.ts` uses `clientPrefix: "VITE_"` over `import.meta.env`.

### `ROLE` decides what starts
`ROLE=all` starts the HTTP server and the workers, `web` only the server, `worker` only the workers. One image, three modes.

### Shutdown drains, then closes, then exits
`SIGTERM` or `SIGINT` → `server.stop()`, drain in-flight `10s`, `await Promise.all(workers.map(w => w.close()))` within `30s`, `await sql.end()`, `redis.quit()`, `process.exit(0)`. Hard exit at `45s`.

### Next.js only when SSR or SEO pays
Same process: `app.all("*", c => nextHandler(c.req.raw))` after the API routes. Otherwise a Vite SPA served statically.

### Dev proxies, prod runs TypeScript
The Vite dev server proxies `/rpc`, `/api` and `/admin` to `bun --watch src/server/index.ts`. Production runs `bun src/server/index.ts`, with no server bundle step.

## API contracts

oRPC v2 procedures, typed errors, pagination, OpenAPI. Recipes in [references/api-contracts.md](references/api-contracts.md).

### Declare context once on the base builder
`os.$context<AppContext>()` at the root, then middlewares for auth, timing and transactions. Every namespace builds off that base, never off a bare `os`.

### Validate with Zod 4 at the router boundary
One Zod version, `import { z } from "zod"`. Derive table-shaped inputs with `createInsertSchema` from `drizzle-orm/zod`, never `drizzle-zod`, then refine at the boundary.

### Output schemas on OpenAPI procedures, typed errors on all of them
An OpenAPI-exposed procedure needs an output schema to describe its response; internal RPC-only procedures may infer. Every procedure declares `.errors({ ... })` from `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `TOO_MANY_REQUESTS`, `INTERNAL_SERVER_ERROR`, with `requestId` in `data` and no stack traces.

### Unknown errors are logged, then flattened
An `onError` interceptor logs at `error` with the `err` serializer and maps anything unrecognised to `INTERNAL_SERVER_ERROR`.

### Keyset pagination by default
Cursor over `(createdAt desc, id desc)`, opaque `base64url` JSON, `limit` default `50`, max `100`. Offset pagination only for admin tables under `10k` rows.

### Creates carry an idempotency key
The client sends `idempotencyKey`; a unique index on `(orgId, idempotencyKey)` enforces it, and the conflicting row is returned instead of a second insert.

### Router-first inside, contract-first across a boundary
Use `oc` contracts when another team or app consumes the API; otherwise define on the router and infer. Client uses `RPCLink` with a `link`-style config, not oRPC v1's `url`-only form.

### Add fields; rename by adding a procedure
Fields are added, never repurposed. A breaking change becomes a new procedure name such as `listV2`, and the old one lives at least one release.

## Auth

Cookies, sessions, revocation, RBAC, rate limiting. Recipes in [references/auth.md](references/auth.md).

### fast-jwt HS256 with a 32-byte secret
Access token `15m`, refresh token `30d` and rotating. The verifier runs `cache: 1000, cacheTTL: 10 * 60 * 1000`.

### Four claims, carried in httpOnly cookies
The token carries `sub`, `sid`, `role`, `exp` and nothing else; profile data comes from cache or database. Both cookies are `httpOnly`, `Secure`, `SameSite=Lax`, `Path=/`. No token in `localStorage`.

### `sessions` is the revocation list
Columns `sid`, `userId`, `expiresAt`, `revokedAt`. Every request checks `session:{sid}` in L1 with TTL `5m`, then the database. Logout or role change deletes the row and the L1 key.

### Cache the user for 5m in L1 only
`user:{id}` TTL `5m`, invalidated on any `users` write. JWT verification state never goes to Redis.

### Role gates the area, permission gates the action
A middleware checks role for a namespace; a per-procedure check names the permission. Never infer a permission from a role inside a service.

### CSRF: POST-only RPC plus an Origin check
oRPC accepts POST only by default. Combined with `SameSite=Lax`, verify the `Origin` header on every mutation.

### Rate limit on Redis
`rate-limiter-flexible`: authenticated `100/min` per user, anonymous `20/min` per IP, auth endpoints `5/min` per IP. Exceeded requests get `429` with `Retry-After`.

## Database schema

Drizzle v1 tables, ids, types, tenancy, relations. Recipes in [references/database-schema.md](references/database-schema.md).

### UUIDv7 primary keys, never `serial`
`id: uuid().primaryKey().$defaultFn(() => Bun.randomUUIDv7())`. On Postgres 18 use the `uuidv7()` default instead. Never `defaultRandom()`, which is v4 and non-sequential.

### `snake_case` casing comes from config
Set `casing: "snake_case"` in `drizzle.config.ts`; write TS identifiers in camelCase. Table names are plural snake, such as `invoice_items`. Existing project casing is kept.

### Timestamps are timezone-aware, with an `$onUpdate`
`timestamp({ withTimezone: true, mode: "string", precision: 3 })`. `createdAt` is `.defaultNow().notNull()`; `updatedAt` adds `$onUpdate` returning `sql` `now()`. Spread the `timestamps` or `timestampsWithDeletedAt` helper.

### Soft delete is `deletedAt` plus a partial index
Partial index `where deleted_at is null`. Every read filters it. Rows are hard-deleted only by a retention job.

### Audit actors are nullable FKs
`createdBy` and `updatedBy` are `uuid` FKs to `users.id` with `onDelete: "set null"`, both indexed.

### Column type comes from the domain
`text`, not `varchar(n)`. Money is `bigint` minor units with `currency char(3)`. Rates are `numeric(12, 6)`. `jsonb` only for schemaless payloads that have a Zod schema at the boundary.

### `pgEnum` only for sets that outlive a release cycle
A closed set that changes less than yearly is a `pgEnum`; anything else is a lookup table with a FK.

### Every FK is indexed and states `onDelete`
No unindexed foreign key ships. `onDelete` is explicit on every one, never left to the default.

### `orgId` is the first column and leads every composite index
`orgId` sits directly after `id` and is the leading column of every composite index. RLS is enabled with `pgTable.withRLS()`, never `.enableRLS()`.

### Relations and schemas are derived from the tables
Declare relations once with Drizzle v1 `defineRelations`, never the v0 `relations()` helper. `createInsertSchema` and `createSelectSchema` come from `drizzle-orm/zod`; row types come from `$inferSelect`.

## Database performance

Indexes, plans, transactions, pooling, tenancy. Recipes in [references/database-performance.md](references/database-performance.md).

### Index what a hot query filters, sorts or joins on
Read the plan before and after adding an index. `EXPLAIN (ANALYZE, BUFFERS)` against realistic data volume, not an empty table. Offset pagination scans and discards, so keep the keyset cursor from API contracts.

### Kill N+1 with one relational query
`db.query` with `with`, or a single `inArray` fetch plus an in-memory group. Never a query inside a loop over rows.

### Transactions stay under 100ms and make no network calls
The service receives `tx`. No HTTP, no queue enqueue, no cache write inside the transaction. Lock balance rows with `FOR UPDATE`.

### Singleton work takes an advisory lock
`pg_advisory_xact_lock(hashtext('job:<name>'))` inside the transaction for work that must run once across processes.

### Bound the pool and every statement
postgres-js `max: 10`, `idle_timeout: 30`, `connect_timeout: 5`; multiply `max` by process count against `max_connections`. The app role sets `statement_timeout = '10s'` and `idle_in_transaction_session_timeout = '10s'`.

### Set the tenant inside the transaction
RLS reads `SET LOCAL app.org_id` set inside the same transaction as the query. A connection-level `SET` leaks across pooled checkouts.

### Log any query over 200ms
`warn` level, with the SQL text and the parameter count. Never the parameter values.

## Migrations

Generate, review, apply safely. Recipes in [references/migrations.md](references/migrations.md).

### Generate, review, commit, then apply under one lock
`drizzle-kit generate`, read the SQL, commit it; `push` is a local convenience, never a deploy step. `migrate()` runs under `pg_advisory_lock(hashtext('migrate'))` before `Bun.serve`.

### Expand and contract for every rename
Add the new column, dual-write, backfill, switch reads, then drop the old column in a later release. A single-step rename breaks the running old code.

### Add nullable, backfill in batches, then tighten
New columns arrive nullable. Backfill `1000` rows per batch. Only then apply `NOT NULL`.

### Large indexes build outside `migrate()`; enum values land one release early
`migrate()` runs all pending files in one transaction. Build indexes on tables over `1M` rows with `CREATE INDEX CONCURRENTLY` from `scripts/db-ops.ts` before deploy, and edit the migration to `IF NOT EXISTS`. Add an enum value in one release and first use it in the next.

### Foreign keys arrive `NOT VALID`, then validate
Adding a validated FK takes a long lock on a large table. Add `NOT VALID`, then `VALIDATE CONSTRAINT` in a separate statement.

### Roll forward; seeds are idempotent
The rollback is the next migration, never an inverse script. Seeds run any number of times without duplicating rows.

## Caching

Three tiers, one key format, one TTL map. Recipes in [references/caching.md](references/caching.md).

### L1 in-process, L2 Redis
L1 is `lru-cache`, max `10_000` entries, TTL at most `5m`, for session, user and config only. L2 is `@keyv/redis` for anything that must be consistent across processes.

### Drizzle cache stays opt-in
Configure the cache with `global: false`, which is the default, and call `.$withCache()` on the chosen read queries. Never `global: true`.

### Versioned keys, TTLs from a named map
Keys are `v1:{entity}:{id}[:{variant}]`; the `v1` prefix invalidates a whole generation. TTLs come from `ttls = { xxs: 60, xs: 600, sm: 3600, md: 21600, lg: 86400, xl: 259200, xxl: 604800 }` seconds, called by name.

### Invalidate after commit
The write path invalidates once the transaction commits. Invalidating inside the transaction races a rollback into a poisoned cache.

### Single-flight on the miss path
A promise map in L1 collapses concurrent misses for one key into one origin call, so a hot key cannot stampede the database.

### Never cache these
Auth decisions beyond `5m`, money balances, anything a `FOR UPDATE` protects.

## Jobs

BullMQ queues, options, idempotency, shutdown. Recipes in [references/jobs.md](references/jobs.md).

### Each module owns its `jobs.ts`
It exports `queue`, `enqueue()` and `processor`. `src/server/jobs/index.ts` registers the workers when `ROLE` is `all` or `worker`.

### Queue names are `domain.action`, with these job options
One queue per action such as `invoice.send`, never a shared `default` queue with a switch inside. Options: `attempts: 3`, `backoff: { type: "exponential", delay: 1000 }`, `removeOnComplete: { age: 86400, count: 1000 }`, `removeOnFail: { age: 604800 }`.

### `jobId` is the idempotency key
A duplicate enqueue with the same `jobId` collapses into the existing job. Derive it from the domain fact, not from a random value.

### Concurrency and lock are explicit
Worker `concurrency` is `5` by default, `20` for IO-bound work, `1` for CPU-bound work. `lockDuration: 30000`.

### Processors check a marker before side effects
A retry re-runs the processor. Check the status marker first so the email, charge or webhook fires once.

### Permanent failures throw `UnrecoverableError`
A malformed payload or a deleted entity must not consume three attempts. Retryable failures throw normally.

### Schedulers, DLQ and the queue dashboard
Cron jobs use `upsertJobScheduler`, which replaces the deprecated repeatable-job API and is idempotent across restarts. The failed set is the DLQ, retained `7` days; a failed job older than `1h` and unretried raises an alert. bull-board mounts at `/admin/queues` behind admin auth.

## Observability

Structured logs, request context, metrics, health. Recipes in [references/observability.md](references/observability.md).

### pino, never `console.*`
JSON in production, `pino-pretty` in development, base fields `service`, `env`, `version`. One `info` line per request carrying `requestId`, `procedure`, `userId`, `orgId`, `durationMs`, `status`.

### `requestId` comes from the header or is minted
Read `x-request-id`, else `crypto.randomUUID()`. Carry it through `AsyncLocalStorage` so nothing has to thread it as an argument.

### Redaction is configured, not remembered
`redact: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.token", "*.secret"]`.

### Levels have fixed meanings
`info` for the per-request line, `warn` for expected 4xx and slow queries, `error` for 5xx with the `err` serializer.

### RED metrics per procedure
Rate, errors, duration. Histogram buckets `[5, 10, 25, 50, 100, 250, 500, 1000, 2500]` ms. Labels are procedure and status only; never `userId`.

### Health and readiness are different routes
`GET /health` returns `200` without touching dependencies. `GET /ready` checks the database with `select 1` and Redis with `ping`, each under a `1s` timeout.

## Resilience

Timeouts, retries, breakers, degradation. Recipes in [references/resilience.md](references/resilience.md).

### Every outbound call has two timeouts
Connect `1s`, total `5s`, via `AbortSignal.timeout()`. A call with no timeout is an outage waiting for a dependency.

### Retry only idempotent operations
`3` attempts, exponential base `1s`, cap `30s`, full jitter. A non-idempotent POST is retried only behind an idempotency key.

### Circuit breaker opens on 5 consecutive failures
cockatiel `ConsecutiveBreaker(5)`. Half-open after `30s`, with one probe request.

### Bulkhead each dependency
One `p-limit` instance per external dependency. Never share a limiter across unrelated dependencies.

### Degrade with declared staleness, on a classified error
When a non-critical dependency fails, serve the stale cache entry and mark it stale in the output schema; never stale money or auth data. Classify each failure as client, dependency or internal and map it to an oRPC code, since a `catch` rethrowing a bare object loses the contract.

## Testing

`bun test`, fake ports, real Postgres. Recipes in [references/testing.md](references/testing.md).

### Tests sit beside the code and take fake ports
`*.test.ts` next to the module, no parallel `__tests__` tree. Mailer, payments and clock are fakes implementing the port interface; assert on what the fake recorded.

### Never mock Drizzle
`mock.module` on the database module tests the mock, not the query. Integration tests run against real Postgres via `@testcontainers/postgresql` or a compose `test` service.

### Reset between tests
`TRUNCATE ... RESTART IDENTITY CASCADE` between tests in a file, one database per test file.

### Routers and processors are called directly
oRPC `call(procedure, input, { context })` exercises middleware and validation without an HTTP server. Pass a fake `Job` object to the processor function rather than spinning up a Redis-backed worker.

## Tooling

Lint, format, types, scripts. Recipes in [references/tooling.md](references/tooling.md).

### oxlint with four plugins, oxfmt with defaults
Plugins are `typescript`, `import`, `promise`, `unicorn`. oxfmt takes no configuration.

### A lint rule keeps server env out of the client
`no-restricted-imports` forbids `env/server` under `src/client/**`. Review cannot catch this reliably; the rule can.

### tsconfig flags are non-negotiable
`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `moduleResolution: "bundler"`.

### One Zod version
Two Zod copies produce schemas that fail each other's `instanceof` checks. Pin one and deduplicate.

## Before you finish

| Detection | Fix |
| --- | --- |
| `serial()` or `defaultRandom()` primary key | `uuid().primaryKey().$defaultFn(() => Bun.randomUUIDv7())` |
| `snake_case` written by hand in table definitions | `casing: "snake_case"` in `drizzle.config.ts` |
| `updatedAt` with no `$onUpdate` | Spread the `timestamps` helper, which sets `$onUpdate` |
| No `deletedAt`, or reads that do not filter it | `timestampsWithDeletedAt` plus a partial index `where deleted_at is null` |
| `relations()` from Drizzle v0 | `defineRelations` in one relations file |
| `drizzle-zod` import | `createInsertSchema` from `drizzle-orm/zod` |
| `.enableRLS()` | `pgTable.withRLS()` |
| `varchar(n)`, or money as `numeric`/`float` | `text`; money as `bigint` minor units plus `currency char(3)` |
| Foreign key without an index or without `onDelete` | Index it and state `onDelete` explicitly |
| Composite index not led by `org_id` | Reorder so `org_id` leads |
| Offset pagination on a user-facing list | Keyset cursor over `(createdAt desc, id desc)`, `limit` 50/max 100 |
| Domain error caught and rethrown as a plain object | oRPC `.errors({ ... })`, `requestId` in `data` |
| Stack trace or raw driver error reaching the client | `onError` interceptor maps unknown to `INTERNAL_SERVER_ERROR` |
| oRPC v1 `RPCLink({ url })` only | v2 `RPCLink` config; check `@orpc/*` 2.x in `package.json` |
| Create with no idempotency key | Client `idempotencyKey` with unique index on `(orgId, idempotencyKey)` |
| `attempts` missing, or not `3` with exponential `1000` | Copy the default job options block |
| `removeOnComplete`/`removeOnFail` unset or count-only | `{ age: 86400, count: 1000 }` and `{ age: 604800 }` |
| Worker with no stated `concurrency` | `5` default, `20` IO-bound, `1` CPU-bound, `lockDuration: 30000` |
| Cache key with no `v1:` prefix or an inline TTL number | `v1:{entity}:{id}` and a name from the `ttls` map |
| `strategy: "all"` or `global: true` on the Drizzle cache | `global: false` plus `.$withCache()` per query |
| Redis used for session or user hot reads | L1 `lru-cache`, max `10_000`, TTL `5m` |
| Cache invalidated inside the transaction | Invalidate after commit |
| `console.log` or `console.error` anywhere | pino logger from `lib/logger.ts` |
| Request log missing `procedure` or `redact` unset | Add both from the observability field list |
| Shutdown with no drain window or no hard-exit timer | Drain `10s`, workers `30s`, hard exit `45s` |
| Single `env.ts` exporting server and client values | `env/server.ts` and `env/client.ts` with `@t3-oss/env-core`, `VITE_` prefix |
| No lint guard on server env imports | `no-restricted-imports` for `env/server` under `src/client/**` |
| `serveStatic` with no `index.html` fallback or no immutable headers | Immutable on hashed assets, `no-cache` on `index.html`, SPA fallback route |
| `mock.module` on the database module | Fake ports for vendors; real Postgres via Testcontainers |
| Folders named `services/`, `utils/`, or files named `*Service.ts` | Feature module with `table/queries/service/router/jobs` |
| Outbound `fetch` with no `AbortSignal.timeout()` | Connect `1s`, total `5s` |
| Network call or enqueue inside a transaction | Move it after commit, or use the outbox |

## Reporting

When asked to review rather than build, report in this shape.

**Severity.** `HIGH` loses or corrupts data, leaks a secret or another tenant's rows, breaks a published contract, or lets a retry double a side effect. `MEDIUM` is a missing index, an unbounded query, an untyped error, a cache or log gap. `LOW` is isolated cleanup.

**Verification.** Without a database: schema, indexes, migration SQL, job options, cache keys and timeouts read from code. With one: run the migration, `EXPLAIN (ANALYZE, BUFFERS)` each hot query, replay a job twice to prove idempotence, kill the process mid-request to check shutdown. Report every check you could not run as `Not verified`.

**Format.** Group findings under the principle each violates, ordered by severity, one row per root cause listing every location it appears in:

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |

`Location` is `path/to/file:line`. `Why` names the principle and the operational impact.

End with `Block` when any `HIGH` remains, `Approve` otherwise. Never `Approve` coverage you did not inspect. With nothing to report, state "No actionable findings" and report verification.
