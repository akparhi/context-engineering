# backend-design master skill — build brief

Target: `claude-shared/skills/backend-design/` (symlinked to `~/.claude/skills/`). Sibling of `frontend-design`; same authoring conventions, same file shape.

## Stack this skill targets

| Layer | Choice | Version pin in recipes |
| --- | --- | --- |
| Runtime | Bun | ≥ 1.2 (`Bun.serve`, `bun test`, `Bun.randomUUIDv7()`) |
| HTTP shell | Hono on `Bun.serve` | hono 4.x |
| RPC | oRPC **v2** (`os`, `oc`, `RPCHandler`, `OpenAPIHandler`) | `@orpc/*` 2.x (currently `2.0.0-beta`; recipes say so once) |
| Validation | Zod 4, one version (`import { z } from "zod"`) | zod 4.x |
| DB | Postgres 17/18 + Drizzle **v1** (`drizzle-orm@rc`) | `defineRelations`, `withRLS()`, `drizzle-orm/zod`; never `relations()`, never `drizzle-zod` |
| Driver | `postgres` (postgres-js) | Bun SQL driver has known date bugs — state as `verify:` |
| Jobs | BullMQ + ioredis | bullmq 5.x |
| Cache | in-process LRU → Redis (`@keyv/redis`) → Drizzle cache (explicit) | |
| Logging | pino | pino 10.x |
| Lint/format | oxlint + oxfmt | |
| Frontend (context only) | Vite SPA by default; Next.js only when SSR/SEO adds value | |

Architecture rulings from the user, non-negotiable:

- **One deployable by default.** Hono serves `/rpc/*`, `/api/*` (OpenAPI), `/admin/queues` (bull-board), `/health`, and the built SPA from `dist/client` with `index.html` fallback. BullMQ workers run in-process behind `ROLE=all|web|worker`. Split only on a stated trigger: worker CPU starving request latency, independent scaling, separate release cadence.
- **Server env never reaches the client.** `@t3-oss/env-core`, two modules: `env/server.ts` (server schema, throws if imported in a browser) and `env/client.ts` (`clientPrefix: "VITE_"`, reads `import.meta.env`). Lint rule forbids `env/server` imports under `src/client/**`.
- **Performance and traceability are first-class.** Every request has a `requestId`, a duration, and a structured log line. Slow queries are logged.

The global `~/.claude/CLAUDE.md` coding standards already state: dependencies point inward, business rules in the model, idempotent retries, versioned contracts, validate at boundaries. **Do not restate them.** This skill supplies the stack-specific recipes and exact values that satisfy them.

## Sources (cloned at /tmp/skillprobe/backend)

| Source | Path | License | Adopt |
| --- | --- | --- | --- |
| oRPC official skills | `orpc-official/skills/{orpc,orpc-contract,orpc-openapi,orpc-migrate}/SKILL.md` | MIT (c) 2023 oRPC | API layer, contract-first, OpenAPI, tRPC→oRPC migration |
| addyosmani/agent-skills | `addyosmani-agent-skills/skills/{api-and-interface-design,observability-and-instrumentation,test-driven-development}` | MIT | API design rules, observability, testing |
| wondelai/skills | `wondelai-skills/skills/{clean-architecture,domain-driven-design,release-it,ddia-systems,system-design}` | MIT | layering, boundaries, resilience thresholds, caching |
| wshobson/agents | `wshobson-agents/` (`microservices-patterns`, `error-handling-patterns`, `architecture-patterns`, `postgresql-table-design`, `sql-optimization-patterns`) | MIT | outbox/saga, error model, normalization |
| ccheney/robust-skills | `ccheney-robust-skills/` (`postgres-drizzle`) | MIT | multi-tenant, soft delete, RLS `SET LOCAL`, keyset, Drizzle v1 addendum |
| honra-io/drizzle-best-practices | `honra-drizzle-best-practices/` | MIT | Drizzle v1 API accuracy, relations v2, `drizzle-orm/zod`, type inference, drizzle-kit |
| supabase/agent-skills | `supabase-agent-skills/` (`supabase-postgres-best-practices`) | MIT | indexing, EXPLAIN, pooling, locking, vacuum |
| pedronauck/skills | `pedronauck-skills/` (`drizzle-safe-migrations`) | verify LICENSE | zero-downtime migrations |
| aj-geddes/useful-ai-prompts | `aj-geddes-prompts/` (`idempotency-handling`) | MIT | idempotency keys |
| sickn33/agentic-awesome-skills | `sickn33-agentic/` (`bullmq-specialist`) | verify LICENSE | BullMQ specifics |
| honojs/skills | `honojs-skills/`, `yusukebe-hono-skill/` | verify LICENSE | Hono on Bun, `serveStatic` |
| oxc-project/oxc | `oxc-project-oxc/` (`migrate-oxlint`) | MIT | oxlint config |
| User reference projects | `/tmp/skillprobe/backend/stack-profile-9b.md`; `/Users/akparhi/Projects/Home/2b` (Turborepo, `apps/web` Next+Hono+tRPC, `apps/workers` Hono+BullMQ, t3-env in `packages/utils/env/core.js`) | — | naming habits, TTL map, job file triple, procedure namespace, pain points to prevent |

Verify any library claim with the context7 MCP tools (oRPC `/dinwwwh/orpc`, Drizzle, BullMQ, Hono, t3-env, pino). Do not use WebFetch. Mark unverifiable claims `verify:`.

## Architecture

```
backend-design/
  SKILL.md                      ~350L index. Workflow, principle + exact value + one link per section.
  NOTICE.md                     MIT texts per source, one block each
  references/
    architecture.md             single-deployable layout, feature modules, ports/adapters, service/query/router split, boundaries
    server-runtime.md           Bun.serve + Hono app, routes, static SPA, Next fall-through, ROLE, graceful shutdown, env modules, Dockerfile
    api-contracts.md            oRPC v2: os/oc, context, middleware, typed errors, output schemas, OpenAPI, pagination, versioning, client (tanstack-query), tRPC migration
    auth.md                     fast-jwt cookie auth, sessions table + sid revocation, user cache, RBAC/permissions middleware, CSRF, rate limiting
    database-schema.md          Drizzle v1 schema conventions, ids, timestamps, soft delete, audit actors, enums, tenant, relations v2, zod derivation, normalization
    database-performance.md     indexing, EXPLAIN, keyset pagination, N+1, transactions, locks, pooling, RLS SET LOCAL, statement timeouts
    migrations.md               drizzle-kit workflow, migrate-at-boot with lock, expand/contract, backfill, CONCURRENTLY, enum evolution, seeds
    caching.md                  L1/L2/Drizzle tiers, key format, TTL map, invalidation, single-flight, what never to cache
    jobs.md                     BullMQ queue/worker layout, options, idempotent jobs, schedulers, DLQ, bull-board, shutdown, in-process vs split
    observability.md            pino setup, request id via AsyncLocalStorage, required log fields, redaction, slow query log, RED metrics, OTel path, health
    resilience.md               timeouts, retries with jitter, circuit breaker, bulkheads, backpressure, outbox, error taxonomy
    testing.md                  bun test layout, service tests with fake ports, Postgres integration (Testcontainers), router tests via call(), job tests
    tooling.md                  oxlint/oxfmt config, tsconfig strict flags, scripts, env lint rule
```

## SKILL.md section order

1. Opener (two sentences) + calibration line (values are exact) + stack line + load rule: this skill assumes the stack table above; where a project differs, keep the project's choice and apply the rule through it.
2. Workflow: ground (read `package.json`, `drizzle.config.ts`, env modules, existing module layout) → design (module boundary, schema, contract) → build → check (`## Before you finish`) → report.
3. Architecture
4. Server runtime
5. API contracts
6. Auth
7. Database schema
8. Database performance
9. Migrations
10. Caching
11. Jobs
12. Observability
13. Resilience
14. Testing
15. Tooling
16. Before you finish (detection → fix table)
17. Reporting (same ladder as frontend-design: HIGH/MEDIUM/LOW, `Location` = `path:line`, Block/Approve, "Not verified")

## Value rulings (apply everywhere; no side-by-side alternatives)

| Topic | Ruling |
| --- | --- |
| Layout | `src/server/{index.ts,app.ts,rpc/,modules/<feature>/,db/,jobs/,lib/,env/}`, `src/client/**` (Vite), `src/shared/**` (contract, types). Module files: `table.ts`, `queries.ts`, `service.ts`, `router.ts`, `jobs.ts`, `*.test.ts`. No `utils/`, no `*Service` suffix |
| Layer roles | `router.ts` translates only (input → service → typed error). `service.ts` owns rules, receives `db \| tx` as first arg. `queries.ts` is Drizzle only, no rules. Vendors behind a port interface in `lib/ports/`, adapter in `lib/adapters/` |
| IDs | `uuid` PK, UUIDv7: `id: uuid().primaryKey().$defaultFn(() => Bun.randomUUIDv7())`. Postgres 18: `uuidv7()` default instead. Never `serial` |
| Identifiers | `casing: "snake_case"` in `drizzle.config.ts`; TS camelCase; table names plural snake (`invoice_items`). Existing project casing is kept |
| Timestamps | `timestamp({ withTimezone: true, mode: "string", precision: 3 })`. `createdAt .defaultNow().notNull()`, `updatedAt .defaultNow().notNull().$onUpdate(() => sql\`now()\`)`. Helper `timestamps` / `timestampsWithDeletedAt` |
| Soft delete | `deletedAt` nullable + partial index `where deleted_at is null`; every read filters it; hard delete only by retention job |
| Audit actors | `createdBy`, `updatedBy` `uuid` FK → `users.id` `onDelete: "set null"`, indexed |
| Types | `text` not `varchar(n)`; money as `bigint` minor units + `currency char(3)`; rates `numeric(12, 6)`; `jsonb` only for schemaless payloads with a Zod schema at the boundary; `pgEnum` only for closed sets that change less than yearly, otherwise lookup table |
| FKs | always indexed; `onDelete` explicit on every FK |
| Multi-tenant | `orgId` first column after `id`, in every composite index as leading column, RLS with `SET LOCAL app.org_id` inside the transaction |
| Pagination | keyset default: cursor over `(createdAt desc, id desc)`, opaque `base64url` JSON, `limit` default `50` max `100`. Offset only for admin tables under `10k` rows |
| Validation | Zod 4 at the router boundary; table-derived schemas via `createInsertSchema` from `drizzle-orm/zod`; output schemas on every procedure exposed through OpenAPI |
| Errors | oRPC `.errors({ ... })` typed per procedure; codes `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `TOO_MANY_REQUESTS`, `INTERNAL_SERVER_ERROR`; `data` carries `requestId`; stack never leaves the server; unknown errors logged at `error` and mapped to `INTERNAL_SERVER_ERROR` |
| API versioning | additive fields only; breaking change = new procedure name (`listV2`), old one kept ≥ one release; contract-first (`oc`) when another team or app consumes it, router-first otherwise |
| Auth | fast-jwt HS256, 32-byte `AUTH_SECRET`; access token `15m`, refresh `30d` rotating; both httpOnly cookies `Secure`, `SameSite=Lax`, `Path=/`; JWT carries `sub`, `sid`, `role`, `exp` only. Verifier `cache: 1000, cacheTTL: 10 * 60 * 1000` |
| Revocation | `sessions` table (`sid`, `userId`, `expiresAt`, `revokedAt`); every request checks `session:{sid}` in L1 (TTL `5m`) then DB; logout/role change deletes row and L1 key |
| User cache | L1 `user:{id}` TTL `5m`, invalidated on any `users` write; never Redis for JWT |
| CSRF | RPC accepts POST only (oRPC default); `SameSite=Lax`; `Origin` header checked on mutations |
| Rate limit | `rate-limiter-flexible` on Redis: authenticated `100/min` per user, anonymous `20/min` per IP, auth endpoints `5/min` per IP; response `429` with `Retry-After` |
| Pool | postgres-js `max: 10` per process, `idle_timeout: 30`, `connect_timeout: 5`; app role `statement_timeout = '10s'`, `idle_in_transaction_session_timeout = '10s'` |
| Transactions | service receives `tx`; no network calls inside; target `< 100ms`; `FOR UPDATE` on balance rows; singleton work via `pg_advisory_xact_lock(hashtext('job:<name>'))` |
| Slow query | log `warn` over `200ms` with the SQL text and param count, never param values |
| Timeouts (outbound) | connect `1s`, total `5s` per HTTP call; `AbortSignal.timeout()` |
| Retries | idempotent operations only; `3` attempts, exponential base `1s`, cap `30s`, full jitter |
| Circuit breaker | open after `5` consecutive failures (cockatiel `ConsecutiveBreaker(5)`); half-open after `30s`; one probe |
| BullMQ | queue name `domain.action` (`invoice.send`); `jobId` = idempotency key; `attempts: 3`, `backoff: { type: "exponential", delay: 1000 }`; `removeOnComplete: { age: 86400, count: 1000 }`, `removeOnFail: { age: 604800 }`; worker `concurrency` `5` default, `20` IO-bound, `1` CPU-bound; `lockDuration: 30000`; `upsertJobScheduler` for cron; failed jobs older than `1h` unretried → alert |
| Outbox | `outbox_events` row inserted in the same transaction as the write; relay job polls every `5s`, `limit(100)`, `for("update", { skipLocked: true })`; `outbox_events.id` is the downstream idempotency key |
| Backpressure | BullMQ worker `limiter: { max: 100, duration: 1000 }` for rate-limited dependencies; bulkhead `pLimit(10)` per outbound dependency; API returns `429` with `Retry-After` when Redis rate limit trips; shed with `503` only under memory pressure |
| Job file triple | `jobs.ts` in the module exports `queue`, `enqueue()`, `processor`; `src/server/jobs/index.ts` registers workers when `ROLE` is `all` or `worker` |
| Graceful shutdown | `SIGTERM`/`SIGINT` → `server.stop()` (stop accepting), drain in-flight `10s`, `await Promise.all(workers.map(w => w.close()))` within `30s`, `await sql.end()`, `redis.quit()`, `process.exit(0)`; hard exit at `45s` |
| Cache tiers | L1 in-process (`lru-cache`, max `10_000` entries) for session/user/config, TTL ≤ `5m`; L2 Redis via `@keyv/redis` for shared data; Drizzle cache with `global: false` (default) and `.$withCache()` on chosen read queries, never `global: true` |
| Cache keys | `v1:{entity}:{id}[:{variant}]`; TTL map `ttls = { xxs: 60, xs: 600, sm: 3600, md: 21600, lg: 86400, xl: 259200, xxl: 604800 }` seconds; write path invalidates after commit; single-flight map in L1 for stampede |
| Never cache | auth decisions beyond `5m`, money balances, anything under a `FOR UPDATE` |
| Logging | pino JSON in prod, `pino-pretty` in dev; base fields `service`, `env`, `version`; per request `requestId`, `procedure`, `userId`, `orgId`, `durationMs`, `status`; `redact: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.token", "*.secret"]`; `requestId` from `x-request-id` or `crypto.randomUUID()`, carried by `AsyncLocalStorage` |
| Log levels | `info` one line per request; `warn` expected 4xx and slow queries; `error` 5xx with `err` serializer; never `console.*` |
| Metrics | RED per procedure; duration histogram buckets `[5, 10, 25, 50, 100, 250, 500, 1000, 2500]` ms; label cardinality: procedure, status, never userId |
| Health | `GET /health` liveness `200` without dependencies; `GET /ready` checks DB `select 1` and Redis `ping` with `1s` timeout |
| Env | `@t3-oss/env-core`, `emptyStringAsUndefined: true`, `runtimeEnv` explicit; server module throws when `typeof window !== "undefined"`; client prefix `VITE_` |
| Static SPA | `serveStatic({ root: "./dist/client" })`; hashed assets `Cache-Control: public, max-age=31536000, immutable`; `index.html` `no-cache`; fallback route serves `index.html` for non-API GETs |
| Next.js variant | only when SSR/SEO is needed; same process; Hono `app.all("*", c => nextHandler(c.req.raw))` after API routes |
| Migrations | `drizzle-kit generate` output reviewed and committed; `migrate()` at boot under `pg_advisory_lock(hashtext('migrate'))` before `serve`; expand/contract for renames; new columns nullable → batched backfill `1000` rows → `NOT NULL`; `migrate()` runs all pending files in one transaction: indexes on tables over `1M` rows built with `CREATE INDEX CONCURRENTLY` via `scripts/db-ops.ts` (postgres-js, `max: 1`, no transaction) before deploy, migration statement edited to `IF NOT EXISTS`; `ALTER TYPE ... ADD VALUE IF NOT EXISTS` in one release, first use in the next |
| Testing | `bun test`; files beside code `*.test.ts`; services with fake ports; integration against real Postgres (`@testcontainers/postgresql` or compose `test` service) per test file, `TRUNCATE ... RESTART IDENTITY CASCADE` between tests; routers via oRPC `call(procedure, input, { context })`; processors called directly with a fake `Job`; never mock Drizzle |
| Tooling | oxlint plugins `typescript`, `import`, `promise`, `unicorn`; `no-restricted-imports` for `env/server` under `src/client`; oxfmt defaults; `tsconfig`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `moduleResolution: "bundler"`; Bun runs TS directly in prod (`bun src/server/index.ts`), no server bundling |
| Dev | Vite dev server proxies `/rpc`, `/api`, `/admin` to the Bun process; `bun --watch src/server/index.ts` |

## Authoring conventions (identical to frontend-design; from Jakub AGENTS.md)

- Headings carry the point, sentence case: `Routers translate, services decide`, not `Layering`.
- Principle states rule and exact value. Recipe lives in the reference. Never both.
- Each rule stated once across the whole skill. SKILL.md owns rules; references own recipes, examples, exceptions.
- **Each reference is self-contained.** Only SKILL.md is always loaded. A reference may link another for depth, never for a value it needs. Duplicate a short block (a config, a 6-line snippet) rather than link.
- No motivation prose. Sentences ≤ 30 words (code span = one word).
- Recipes in TypeScript for the pinned stack. Where the project differs (Node, tRPC, Prisma), say "keep the project's choice" once in SKILL.md; do not write alternate recipes.
- No author names in body. Attribution only in `NOTICE.md` and an HTML comment at the top of each file: `<!-- Adapted from <source> (MIT). See NOTICE.md -->`.
- Each reference opens with one scope line, then sections, and ends with a `## Before you finish` detection → fix table.
- Every library claim either verified via context7 or marked `verify:`.

## Dropped, on purpose

- Framework-agnostic alternate recipes (Express, Fastify, NestJS, Prisma, tRPC) — one line "keep the project's choice" covers them; `api-contracts.md` keeps the tRPC → oRPC migration section only.
- Microservices decomposition, service mesh, Kubernetes, gRPC, GraphQL — outside the single-deployable ruling. `architecture.md` keeps the split triggers and the outbox pattern only.
- Supabase/Neon platform features, Drizzle Studio, drizzle-kit `push` (dev-only mention allowed), install/CLI walkthroughs (link to official docs instead).
- Emil-style philosophy sections, canned openers, per-skill Reporting triplication.

## Known stale content to fix while adapting

- Sources using `relations()`, `drizzle-zod`, `.enableRLS()`, `db._query` → Drizzle v1 forms (`defineRelations`, `drizzle-orm/zod`, `pgTable.withRLS()`, `db.query`).
- oRPC v1 forms (`os.route`, `RPCHandler` from `@orpc/server/fetch` is still correct; check `.errors`, `implement`, `createORPCClient`, `@orpc/tanstack-query`) → v2 per `orpc-official/skills/*`.
- `serial` primary keys → UUIDv7 ruling.
- `console.log` in any snippet → logger.
- Express `req/res` snippets → Hono `c` or oRPC context.
