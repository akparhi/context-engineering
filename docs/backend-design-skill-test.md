# backend-design skill — test scenario

Reusable RED/GREEN check. Same prompt with and without the skill; compare the self-report.

## Scenario prompt

> In a scratch dir, scaffold a Bun + TypeScript backend feature for Ledgerly (invoice reconciliation for small accounting firms). Stack: Bun, Hono, oRPC, Drizzle ORM (Postgres), BullMQ + Redis, pino, Zod. Do not run a database; write code and config only. Implement: `invoices` table with schema file and a generated-style migration SQL; oRPC procedures `invoices.list` (paginated, filter by status), `invoices.create` (must be safe against client retries), `invoices.void`; auth middleware requiring a logged-in user with an org; a background job that emails the invoice PDF after creation, with retries; org settings read on every request and cached; request logging; server entry that serves the API and a built SPA from `dist/client`; graceful shutdown; env handling for server and client; at least one test file for the service. Then write `SELF-REPORT.md` covering: id strategy, identifier casing, timestamp columns, indexes, pagination mechanism, error shape, how create is retry-safe, job options (attempts, backoff, concurrency, jobId), cache keys and TTLs, log fields per request, shutdown sequence, how server env is kept from the client, test approach, and every place you were unsure.

RED run: agent forbidden from reading any skill. GREEN run: agent told to invoke `backend-design` first.

## GREEN pass criteria

- UUIDv7 ids, `snake_case` identifiers via drizzle config, `timestamptz` with `createdAt`/`updatedAt`/`deletedAt` helper
- FK and filter columns indexed; partial index on `deleted_at is null`; `org_id` leading in composite indexes
- Keyset pagination with opaque cursor, `limit` default 50 max 100
- oRPC typed `.errors()`; `requestId` in error data; no stack to client
- `invoices.create` idempotent via client `idempotencyKey` unique per org (or `jobId` for the job), documented
- BullMQ: `attempts: 3`, exponential `1000`, `removeOnComplete`/`removeOnFail` set, `jobId` = idempotency key, concurrency stated
- Cache: `v1:` prefixed keys, TTL from a named map, invalidation on settings write, L1 for session/user
- pino with `requestId`, `procedure`, `userId`, `orgId`, `durationMs`, `status`; redact list present; no `console.log`
- Shutdown: stop server → drain → close workers → close DB/Redis; hard exit timer
- `env/server.ts` and `env/client.ts` split with `@t3-oss/env-core`, `VITE_` prefix; lint rule or guard against server env in client
- Hono `serveStatic` for `dist/client` with `index.html` fallback and immutable asset caching
- `bun test` file testing the service with a fake mailer port, not mocking Drizzle
- Self-report names the skill sections it read and lists gaps honestly

## RED results (2026-09-16, sonnet, no skill) — `/tmp/skillprobe/backend/baseline/`

| Criterion | Result | Baseline did |
| --- | --- | --- |
| UUIDv7, snake_case config, timestamp helpers | partial | UUIDv4 `defaultRandom()`; snake_case by hand; no `deletedAt`, `updatedAt` has no `$onUpdate` |
| Indexes | pass | FK + composite `(org_id, created_at, id)`; no partial soft-delete index (no soft delete) |
| Keyset pagination 50/100 | pass | cursor `{createdAt,id}` base64, `limit + 1` |
| Typed `.errors()`, `requestId` in data | fail | domain errors caught and rethrown as `{code,message}`; oRPC API unverified (`@orpc/server 0.45`) |
| Idempotent create | pass | unique `(org_id, idempotency_key)` + `ON CONFLICT DO NOTHING` + select |
| BullMQ options | fail | `attempts: 5`, delay `3000`, `removeOnComplete { count: 500 }` no age; `jobId: invoiceId` ok |
| Cache tiers/keys/TTL map | fail | one Redis key `ledgerly:org-settings:{orgId}` TTL 60s; no L1, no `v1:`, no named map, no user/session cache |
| Log fields + redact | partial | `requestId method path status durationMs orgId userId`; no `procedure`, no `redact` |
| Shutdown | partial | stop → worker → queue → db → redis → exit; no drain timeout, no hard-exit timer |
| Env split t3-env | fail | one `env.ts` exporting `env` + `clientEnv` allowlist; no t3-env, no lint guard, `PUBLIC_` prefix |
| serveStatic + fallback + immutable | partial | written from memory, unverified; no cache headers |
| Service test without mocking Drizzle | fail | `mock.module` on db module |
| Layout | fail | by type: `services/ middleware/ procedures/ jobs/ cache/`, `invoiceService.ts` suffix |
| Auth | fail | JWT stub; no sessions/revocation, no rate limit, no RBAC |
| Honest gaps | pass | 6 listed |

Score 4 pass / 4 partial / 7 fail.

## GREEN results (2026-09-16, sonnet, skill v0 before codex fixes) — `/tmp/skillprobe/backend/green/`

| Criterion | Result | Notes |
| --- | --- | --- |
| UUIDv7, snake_case config, timestamp helpers | pass | `Bun.randomUUIDv7()`, `casing: "snake_case"` in both config and `drizzle()`, `timestampsWithDeletedAt` |
| Indexes | pass | FK + `(org_id, created_at, id)`, partial unique `(org_id, idempotency_key) where deleted_at is null` |
| Keyset pagination 50/100 | pass | opaque base64url, `limit + 1`, `BAD_REQUEST` on bad cursor |
| Typed `.errors()`, `requestId` in data | pass | `onError` maps unknowns to `INTERNAL_SERVER_ERROR` |
| Idempotent create | pass | `ON CONFLICT DO NOTHING` + return existing; job `jobId: invoice:{id}` |
| BullMQ options | pass | `attempts 3`, exponential `1000`, `removeOnComplete { age 86400, count 1000 }`, `removeOnFail { age 604800 }`, `UnrecoverableError` |
| Cache tiers/keys/TTL map | pass | `v1:org-settings:{orgId}` `ttls.sm`; L1 lru 10k/5m single-flight; L2 keyv redis; invalidate after commit |
| Log fields + redact | pass | `requestId procedure userId orgId durationMs status`; redact list; slow query warn >200ms |
| Shutdown | pass | stop → 10s drain → workers → sql.end → redis.quit → exit; 45s hard exit |
| Env split t3-env | partial | `env/server.ts` + `env/client.ts` correct; oxlint restricted-import rule not scaffolded |
| serveStatic + fallback + immutable | pass | marked `verify` on fallback form |
| Service test without mocking Drizzle | pass | Testcontainers + `TRUNCATE`, fake `EmailPort`; processor test missing |
| Layout | pass | `src/server/modules/invoices/{table,queries,service,router,jobs,*.test}.ts`, `lib/ports`, `lib/adapters` |
| Auth | partial | session L1 cache + middleware shape; user cache keyed by token not id; fast-jwt deferred |
| Honest gaps | pass | 8 skill gaps + 6 uncertainties listed |

Score 13 pass / 2 partial / 0 fail (RED: 4 / 4 / 7).

Skill gaps reported by GREEN agent, to fix: job payload must carry `orgId` for tenant-scoped processors; caching write path (update → commit → invalidate) missing an example; `@bull-board/hono` mount and `serveStatic` fallback forms need verification; `drizzle-orm/postgres-js/migrator` import path under v1 unconfirmed.

Fix round 1 applied after GREEN (see `docs/backend-design-skill-fixes.md`): 55 codex rows applied after verification, 61 dropped as design additions beyond the researched sources; GREEN gaps G1–G7 applied. Second GREEN run not performed.
