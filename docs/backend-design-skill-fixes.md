# backend-design skill — fix round 1

Inputs: codex review `/tmp/skillprobe/backend/codex-review-refs.md` (triaged, not applied wholesale), GREEN self-report `/tmp/skillprobe/backend/green/SELF-REPORT.md`, orchestrator notes below. Brief remains the authority: `docs/backend-design-skill-brief.md`.

## Already fixed by orchestrator (do not redo)

- `caching.md`, `database-performance.md`, brief: Drizzle cache is `global: false` default + `.$withCache()`; no `strategy` key.
- `migrations.md`, SKILL.md, brief: `migrate()` runs pending files in one transaction. Large-table indexes via `scripts/db-ops.ts` with `CONCURRENTLY` before deploy, migration edited to `IF NOT EXISTS`. Enum value added one release before first use.
- `migrations.md`: `NOT NULL` claim corrected (fails without default; volatile default rewrites).
- `server-runtime.md`: hard-exit timer moved inside `shutdown`; drain via `Promise.race([server.stop(), sleep(10_000)])`; readiness 1s race; single `index.html` fallback with `no-cache`; Next variant on `@hono/node-server` with `RESPONSE_ALREADY_SENT`; bull-board mount verified.
- `jobs.md`: `hono/bun` `serveStatic` import verified for `HonoAdapter`.
- Brief gained rulings: outbox poll `5s`/`limit(100)`/`skipLocked`; worker `limiter { max: 100, duration: 1000 }`; bulkhead `pLimit(10)`; breaker = 5 consecutive failures.

## From GREEN self-report (apply)

| # | File | Fix |
| --- | --- | --- |
| G1 | `jobs.md` | Job data carries `{ orgId, ...ids }`; processor opens `db.transaction` and sets `SET LOCAL app.org_id` before tenant-scoped queries. Add to processor recipe and checklist. |
| G2 | `caching.md` | Add write-path example: `updateOrgSettings` → `db.transaction` → after resolve `invalidate("v1:org-settings:{orgId}")` (L1 + L2). |
| G3 | `auth.md` | User cache key is `user:{id}` (from verified `sub`), never keyed by token. State once in the user-cache section and checklist. |
| G4 | `tooling.md` | Ensure the `.oxlintrc.json` `no-restricted-imports` block is a complete copy-paste snippet with the `src/client/**` override, not prose. |
| G5 | `testing.md` | Processor test snippet must be present: `processor(fakeJob)` twice, assert one side effect. |
| G6 | `migrations.md` | State the v1 migrator import: `import { migrate } from "drizzle-orm/postgres-js/migrator"` (verify via context7; mark `verify:` if unconfirmed). |
| G7 | SKILL.md | Add the three new brief rulings (outbox, limiter, bulkhead) to Architecture / Resilience sections; link recipes. |

## From codex review (triaged)

To be filled by the triage implementer: one row per accepted finding with `File:line | Fix | Verified via`. Dropped findings listed below the table with a one-line reason.

### Group A

# backend-design refs — triage A (auth, api-contracts, architecture, tooling)

Scope per coordinator: apply only (1) library/API facts verified wrong via context7, (2) contradictions
with a brief ruling or another statement in the same file, (3) plain bugs in our own snippets.
All design additions codex proposed were dropped.

## Applied

| Codex # or G# | File:line | Fix | Verified via |
| --- | --- | --- | --- |
| 3 | `auth.md:45` | `sid: session.id` → `sid: session.sid`; the `sessions` table in the same file declares `sid` as the PK and has no `id` column | Same-file contradiction |
| 4 | `auth.md:88` | `sessions.expiresAt` moved to `mode: "date"` so expiry is an instant, not a text form | Brief timestamp ruling + Drizzle `mode` semantics |
| 4 | `auth.md:126–147` | `loadSession` no longer compares `row.expiresAt > new Date().toISOString()`. Expiry and revocation moved into the query: `isNull(sessions.revokedAt)` + `gt(sessions.expiresAt, sql\`now()\`)`. Note added that `mode: "string"` returns the Postgres text form (`2026-09-16 10:00:00.123+00`), not ISO, and does not sort lexically | Plain bug in our snippet |
| 4 | `api-contracts.md:144` | `createdAt: z.iso.datetime()` output field annotated: a `mode: "string"` column reads back as the Postgres text form and fails `z.iso.datetime()`. Fix is `to_char` in the query or `mode: "date"` + `.toISOString()` | Plain bug in our snippet |
| 4 | `api-contracts.md:233` | Cursor `createdAt` validated as `z.string().min(1)`, carried exactly as read from the row, instead of `z.iso.datetime()` which rejects the real column output | Plain bug in our snippet |
| 7 | `api-contracts.md:124–132` | `createInsertSchema(...).omit({...})` → `.pick({ number, amountMinor, currency, dueAt, customerId })`, one-line allow-list. Server-owned columns (`id`, `orgId`, `createdAt`, `updatedAt`, `deletedAt`, `createdBy`, `updatedBy`) are never picked. Two checklist rows added | Brief ruling (validate at boundaries) + same-file `orgId` rule |
| 8 | `api-contracts.md:62–75` | Transaction middleware now runs `await tx.execute(sql\`select set_config('app.org_id', ${orgId}, true)\`)` immediately after opening the transaction. Without it every tenant RLS policy on that `tx` matches nothing | Brief ruling: RLS with `SET LOCAL app.org_id` inside the transaction |
| 10 | `api-contracts.md:142` | `amountMinor: z.number().int()` kept, paired with `bigint({ mode: "number" })` and a documented `2^53 - 1` minor-unit ceiling; escape hatch to `mode: "bigint"` + `z.string()` noted | Brief ruling: money as `bigint` minor units (column type kept) |
| 13 | `architecture.md:124–147` | `pollOutbox` wrapped in `db.transaction`; the `.for("update", { skipLocked: true })` select and the `processedAt` update now share one `tx`. Note added that on a pooled handle the locks release at statement end and a second poller re-reads the rows | context7 `/drizzle-team/drizzle-orm` (lock clauses are transaction-scoped) |
| 48 | `tooling.md:92` | "This catches direct imports, aliased imports, and barrel re-exports" → the rule matches the import specifier as written, so it catches direct and aliased paths but not a re-export through a non-matching barrel specifier. Claim corrected only; no new enforcement added | context7 `/websites/oxc_rs_guide_usage` (`no-restricted-imports` is specifier-pattern based) |
| 57 | `auth.md:16–24, 45` | `noTimestamp: true` added to both signers; fast-jwt adds `iat` by default, contradicting the same file's "four claims. Nothing else". Checklist row added | context7 `/nearform/fast-jwt` (`noTimestamp` — "Skip iat claim"; default `false`) |
| 80 | `tooling.md:46` | "oxfmt has no config file; it reads defaults only" → this skill uses defaults and adds no config file; oxfmt does support `.oxfmtrc.json`, `.oxfmtrc.jsonc`, `oxfmt.config.ts`, `oxfmt.config.mts` | context7 `/websites/oxc_rs_guide_usage` (formatter config page) |
| 81 | `tooling.md:110` | "creates two Zod instances, breaks schema merging" → "same package, but a second spelling for one concept". Root and `zod/v4` entrypoints of one installed Zod 4 package are not separate instances | context7 `/colinhacks/zod` |
| G3 | `auth.md:149–160` | User cache section heading and body now state the key is `user:{id}` from the verified `sub` claim, never the token string, with the reason (`invalidateUser` could not find per-token entries). Checklist row added | Fixes doc G3 |
| G4 | `tooling.md:9–40` | Verified the `.oxlintrc.json` `no-restricted-imports` block is already a complete copy-paste snippet with the `src/client/**` override — no prose-only form. No change needed | Fixes doc G4 |

## Dropped

| Codex # | Reason |
| --- | --- |
| 1 | Design addition: separate derived HS256 keys and per-kind verifiers. Brief pins one `AUTH_SECRET` with one verifier config. Applied then reverted per scope change. |
| 2 | Design addition: transactional refresh rotation with `.for("update")`. Applied then reverted per scope change. |
| 5 | Design addition: expanding the Origin check from `/rpc/*` to `*`. Applied then reverted per scope change. |
| 9 | Design addition: restructuring `interceptors` into a single `clientInterceptors` catch. Applied then reverted per scope change. The oRPC lifecycle claim did verify, but the change is a rewrite, not a fact fix. |
| 11 | Design addition: cursor decode error mapping to `BAD_REQUEST` with `requestId`. Applied then reverted; the file already states "an invalid cursor is a client error: throw `BAD_REQUEST`". |
| 12 | Design addition: outbox everywhere. `architecture.md` already owns the outbox recipe; the brief keeps side-effect enqueue guidance there. |
| 34 | Design addition: routing auth caches away from the L2 helper. Applied then reverted; brief already pins auth caches to L1 at `5m`. |
| 53 | Style/preference: `@/*` alias vs displayed import paths. No defect in the tooling recipe itself. |
| 54 | Style/preference, and outside these four files' authority: service transaction ownership wording. |
| 55 | Style/preference: whether cache-aside sits in `queries.ts` or an adapter. Contradiction is with `caching.md`, not owned here. |
| 56 | Contradicts a brief ruling: the client imports the router as a *type only*, which the brief and `api-contracts.md` both already state explicitly. |
| 58 | Contradicts a brief ruling only in emphasis; `revokedAt` + L1 delete is the stated logout policy in the file. Applied then reverted. |
| 59 | Style/preference: `v1:` prefix unification. Auth L1 keys are process-local and never share the Redis keyspace. |
| 60 | Style/preference: `limit`/`pageSize` clamping wording; the file already fetches `limit + 1` correctly. |
| 70 | Outside these files' authority: log-level classification is owned by `observability.md`. |
| 83 | Style: sentence-length split of the logging prohibition. Applied then reverted. |
| 85 | Style: heading rewording in `architecture.md`. |
| 86 | Style: heading rewording in `tooling.md`. |
| 88 | Style: motivation-prose removal. Applied then reverted. |
| 46 | Not in these four files (`testing.md`). |
| 52 | Not in these four files (`server-runtime.md` owns the env schema). |
| 6, 14–45, 47, 49–51, 61–68, 71–79, 82, 84, 87 | Do not touch `auth.md`, `api-contracts.md`, `architecture.md`, or `tooling.md`. |

Counts: 14 applied (12 codex rows + G3 + G4), 20 codex rows explicitly dropped with reason,
remainder out of scope for these four files.

### Group B

# fixes-B — triage of codex rows touching database-schema.md, database-performance.md, migrations.md, testing.md

Scope narrowed mid-task by the user: apply only (1) library/API facts verified wrong via context7, (2) contradictions with a brief ruling or another statement in the same file, (3) plain bugs in our own snippets. All MEDIUM/LOW style, preference, and design-addition rows dropped; the few applied before the narrowing were reverted.

## Applied

| Codex # or G# | File:line | Fix | Verified via |
| --- | --- | --- | --- |
| 19 | `migrations.md:13-31` | Replaced `drizzle/0001_x.sql` + `meta/_journal.json` with Drizzle v1 Folders v3: one timestamped folder per migration holding `migration.sql` and `snapshot.json`. Added the folder tree, the `drizzle-kit up` upgrade path for v0 projects, and the note that `drizzle-kit drop` was removed. | context7 `/drizzle-team/drizzle-orm-docs` — `pg/v0-v1-changes`, `mysql/upgrade-v1`, `latest-releases/drizzle-orm-v1beta2` ("Folders v3": no more `journal.json`, SQL + snapshot grouped into per-migration folders, `drizzle-kit drop` removed); `singlestore/drizzle-kit-generate` ("Save `migration.sql` and `snapshot.json` in migration folder under current timestamp") |
| 19 | `migrations.md:29` | `--custom` migration described as getting its own timestamped folder, not a journal entry. | Same as above; `cockroach/kit-custom-migrations` confirms `generate --custom --name=…` still exists |
| 19 | `migrations.md:186` (enum), checklist rows | Enum example path changed to `drizzle/20242411100000_invoice_status_add_refunded/migration.sql`; checklist rows "Journal and snapshots" → "Migration folder", "Backfill ordering" → "Backfill placement"; loose-`.sql` row reworded; new Before-you-finish row flagging any `drizzle/meta/_journal.json` reference. | Same as above |
| 19 | `testing.md` | No path change needed — the fixture passes `migrationsFolder: './drizzle'`, which is still the folder root in v1. | Same as above |
| 18 | `migrations.md:35-70` | Boot migration now opens a dedicated `postgres(env.DATABASE_URL, { max: 1 })` client and its own `drizzle({ client })`, takes `pg_advisory_lock` there, migrates, unlocks in `finally`, then `client.end()`. Added the explanation that the pooled app handle can issue the unlock on a connection that never held the lock. | context7 `/drizzle-team/drizzle-orm` postgres-js README: "creating a dedicated Postgres.js client with the `max: 1` connection limit … required by Postgres.js to handle migration transactions correctly". Contradiction with the file's own `max: 10` pool statement. |
| 20 | `migrations.md:104-125` | Batched backfill moved out of the `--custom` migration into `scripts/backfill-invoice-currency.ts` (postgres-js, `max: 1`, one statement per batch, loop until zero rows). The `DO $$ … COMMIT; … $$` block and its `verify:` hedge are gone. | Same-file contradiction: the file already states `migrate()` wraps all pending files in one transaction, so a migration-embedded `COMMIT` cannot run. Consistent with the existing `scripts/db-ops.ts` recipe. |
| 20 | `migrations.md:186-190` | "Nothing else in that file" replaced: a separate file is not a separate commit under `migrate()`; the only reliable split is the release boundary. | Same-file contradiction with the one-transaction statement |
| 21 | `migrations.md:127-151` | `ADD CONSTRAINT … NOT VALID` and `VALIDATE CONSTRAINT` split across release A and release B, with the note that inside one `migrate()` transaction the `ACCESS EXCLUSIVE` lock from `ADD CONSTRAINT` is held through the scan and `--> statement-breakpoint` does not release it. Long validations routed through `scripts/db-ops.ts`. | Same-file contradiction with the one-transaction statement; mirrors the existing concurrent-index recipe |
| 21 | `migrations.md:214-233` | FK section given the same two-release split for `NOT VALID` → `VALIDATE`. | Same as above |
| 21 | `migrations.md` checklist + Before-you-finish | "New `NOT NULL` column" and "New foreign key" rows say separate releases; new rows for the pooled-handle lock, `COMMIT` inside a migration, and `NOT VALID`+`VALIDATE` in one migration. | Same as above |
| 22 | `migrations.md:250-275` | Seed script imports `sql` from `drizzle-orm` (fragment tag for `excluded.name`) and the postgres-js handle as `client`, closing with `client.end()`. One sentence names the distinction. | Plain defect: `sql` from `./client` is the postgres-js tag, which cannot build `excluded.*` fragments for `onConflictDoUpdate` |
| 6 | `database-schema.md:270` | One sentence corrected: superusers and `BYPASSRLS` roles always bypass; table owners bypass their own tables unless `FORCE ROW LEVEL SECURITY`; app connects as a `NOSUPERUSER NOBYPASSRLS` non-owner. | Postgres RLS semantics; the previous wording implied `FORCE` constrains superusers, contradicting the brief's non-owner app-role ruling |
| 6 | `database-performance.md:208` | Same correction in the `SET LOCAL` section, one sentence. | Same as above |
| 7 | `database-schema.md:296` | `createInsertSchema(...).omit()` now omits `orgId`, `createdBy`, `updatedBy` alongside `id` and the timestamps. | Same-file contradiction: the sentence directly below already says "Omit server-owned columns (`id`, timestamps, `orgId`, audit actors)" |
| 37 | `database-performance.md:224-268` | `SlowQueryLogger implements Logger` with `queueMicrotask` removed. Replaced with a `timed(label, run)` wrapper used in `queries.ts`, plus the postgres-js `debug: (conn, query, parameters, paramTypes)` hook for SQL text and `parameters.length` (dev only). Heading changed to "timed at the call site"; new Before-you-finish row. | context7 `/drizzle-team/drizzle-orm` (`Logger.logQuery(query, params)` has no duration parameter) and `/porsager/postgres` configuration + `src/connection.js` `build()`: `options.debug(id, string, parameters, types)` fires before the query is sent, so neither hook carries timing |
| 43 | `testing.md:278` | `coverageThreshold = { line = 80 }` → `{ lines = 0.8, functions = 0.8 }`, with a note that values are fractions checked per file and `statements` is accepted but not enforced. | context7 `/oven-sh/bun` `docs/test/configuration.mdx` and `docs/guides/test/coverage-threshold.mdx` |
| 44 | `testing.md:95-107, 125-140` | Fixture initialises `drizzle({ client: sql, relations, casing: 'snake_case' })` instead of `drizzle(sql, { schema })`, in both the container and the `DATABASE_URL` paths. | context7 `/drizzle-team/drizzle-orm-docs` relations-v1-v2 (v1 takes `relations`, `db.query` requires it); brief ruling `casing: "snake_case"`. Also a plain defect: the old form yields no `db.query` namespace. |
| 47 | `testing.md:91-110` | `container` typed `StartedPostgreSqlContainer \| undefined`; `truncate()` now only truncates; new `teardown()` does `await sql?.end()` then `await container?.stop()`. Every call site switched to `afterAll(() => teardown())`, service test gained `afterEach(() => truncate())`. | Plain defect: `container.stop()` ran unconditionally although the `DATABASE_URL` path never assigns `container` |
| 45 | `testing.md:156-177` | `id: 'does-not-exist'` → `ABSENT_ID = '00000000-0000-7000-8000-000000000000'`; added an `authedContext()` helper supplying `db`, `user`, `orgId`, `requestId`, `headers`, `logger`; keyset pagination test reuses it. | Plain defect: a UUID input schema rejects the old value with `BAD_REQUEST`, so the test never reaches `NOT_FOUND`; the partial context fails the auth middleware first |
| 46 | `testing.md:186-205` | Revoked-session test signs a real `access_token` naming the revoked `sid` and passes `db` in the context, instead of a `sid=revoked-session-id` cookie. | Plain defect + cross-file contradiction: `auth.md` reads the `access_token` cookie and verifies the JWT before any session lookup, so the old cookie name asserted the right code for the wrong reason |
| G5 | `testing.md:205-230` | Processor idempotency is now one test making two `processor(job)` calls and asserting `sentAt` is set and `mailer.sent` has length `1`. | Required by the fix-round G5 row; also removes the cross-test ordering dependency |
| G6 | `migrations.md:38` | Confirmed `import { migrate } from "drizzle-orm/postgres-js/migrator"` is correct for v1; kept, `verify:` not needed. | context7 `/drizzle-team/drizzle-orm` postgres-js README |

## Dropped

| Codex # | Reason |
| --- | --- |
| 4 | `database-schema.md:70` timestamp comparison. Out of narrowed scope: a design change to the timestamp ruling, not a verified API fact or same-file contradiction. Brief fixes `mode: "string"`. |
| 10 | `database-schema.md:118` money serialisation. Brief rules money is `bigint` minor units; the OpenAPI representation is `api-contracts.md`'s concern, not this file's. |
| 16 | Touches `jobs.md` only, not my four files. Verified the v1 RQB object-filter form via context7 while checking row 61; no occurrence of the old `where: eq(...)` form exists in my four files. |
| 54 | `testing.md:58-67` service instantiation style. Cross-file consistency/design preference, not in the narrowed categories. |
| 60 | `database-performance.md:99` `limit + 1` for `nextCursor`. Applied then reverted: a design addition beyond the brief's keyset ruling, not a stated contradiction inside the file. |
| 61 | `database-performance.md:119-131` soft-delete predicates in the N+1 example. Applied then reverted: MEDIUM design addition; the file's keyset recipe already demonstrates `isNull(deletedAt)`. |
| 62 | `database-performance.md:191` pooler session-state wording. Applied then reverted: refinement of an already-directionally-correct statement, not a verified-wrong API fact. |
| 63 | `database-performance.md:222` "override downward" wording. Applied then reverted: wording nit. |
| 64 | `database-performance.md:173` retry base/cap/jitter values. Applied then reverted: the brief's resilience ruling lives in `resilience.md`; restating it here is a self-containment preference, not a defect. |
| 68 | `testing.md:33` fake-`Job` sufficiency. The mock-db comment it cites is in `jobs.md`; my processor test already uses the real test database and a fake mailer port. |
| 73 | `testing.md:70` truncate timing. Substantively covered by the row 47 `truncate`/`teardown` split and the G5 single-test rewrite; no separate change. |
| 74 | `testing.md:42, 58-59` relative import paths. Applied then reverted: path-style preference with no stated convention in the brief. |
| 75 | `migrations.md:24` CI gate untracked-file handling. Applied then reverted: CI hardening, not a documented-API error or in-file contradiction. |
| 77 | `NOTICE.md` licence attribution. Not one of my four files. |
| 79 | `NOTICE.md` source blocks. Not one of my four files. |
| 84 | `migrations.md:15, 74, 143` sentence length. Applied then reverted: LOW style. |
| 87 | `testing.md` topic headings. Applied then reverted: LOW style. |
| 88 | `database-schema.md:335` motivation prose. LOW style. |

## Verification notes

- Row 19 is the one that materially changed the file: the timestamp-folder claim is **true** for Drizzle v1. The v1 upgrade docs state plainly that `journal.json` is removed and SQL files plus snapshots are grouped into per-migration folders (Folders v3, discussion #2832), and `drizzle-kit generate` "saves `migration.sql` and `snapshot.json` in migration folder under current timestamp". Old `drizzle/0000_x.sql` + `meta/_journal.json` is pre-v1 storage. `migrationsFolder: './drizzle'` is unchanged, so no runtime code needed editing.
- `drizzle-kit generate --custom --name=…`, `--name`, and `drizzle-kit up` all still exist in v1; `drizzle-kit drop` does not.
- Neither Drizzle's `Logger.logQuery` nor postgres-js `debug` carries a duration — both fire before execution — so slow-query timing has to happen at the call site. postgres-js `debug` signature confirmed from `src/connection.js`.

### Group C

# backend-design references — triage round C

Scope: `caching.md`, `jobs.md`, `resilience.md`, `observability.md`, `server-runtime.md`.

Narrowed per orchestrator scope change: apply only (1) library/API facts verified wrong via context7, (2) contradictions with a brief ruling or the same file, (3) plain bugs in our own snippets. All cache-fencing, tier-redesign, and style/design rows dropped.

## Applied

| Codex # or G# | File:line | Fix | Verified via |
| --- | --- | --- | --- |
| 15 | `jobs.md:104–109` | `jobId` must not contain `:` (BullMQ Redis key separator) or be all digits. Key format changed to `invoice-${invoiceId}`. | context7 `/taskforcesh/bullmq` — "Custom IDs must not contain the colon separator or consist solely of digits" |
| 17 | `jobs.md:111`, `resilience.md:224` | Added: queue dedup lasts only while the job exists; `removeOnComplete` frees the id, so the DB completion marker is the durable guard. | context7 `/taskforcesh/bullmq` — "uniqueness check only applies to jobs currently in the queue; once a job is removed, its ID can be reused" |
| 16 | `jobs.md:117–119`, `caching.md` `fetchOrgSettings` | `db.query.*` `where` uses RQB v2 object filters `{ id: { eq: x } }`, not `eq()`. | context7 `/websites/rqbv2_drizzle-orm-fe_pages_dev` — "`where` is now object" |
| 14 | `jobs.md:124–131` | Network call removed from `db.transaction`. Processor now: claim row `for update` in a short tx → send outside tx with provider idempotency key → mark sent in a second tx. Removed the false "sentAt and email send are atomic" claim. | Brief ruling "Transactions: no network calls inside" |
| G1 | `jobs.md` (new section before processor) | Job data carries `{ orgId, ...ids }`; processor runs `select set_config('app.org_id', ${orgId}, true)` inside `db.transaction` before tenant reads. Added to processor recipe and checklist. | Brief ruling "RLS with `SET LOCAL app.org_id` inside the transaction" |
| 25 | `jobs.md:225–228` | `server.stop()` drains in-flight requests; `server.stop(true)` force-closes. Shutdown now drains first with a 10 s budget, then force-closes survivors. Also added the once-only guard and `clearTimeout` on the hard-exit timer to match `server-runtime.md`. | context7 `/oven-sh/bun` — "By default, `stop()` allows in-flight requests to complete. Pass `true` to immediately terminate all connections" |
| 41 | `resilience.md:22–26` | `maxAttempts` counts retries *after* the initial call, so 3 total attempts needs `maxAttempts: 2`. Default generator is decorrelated jitter, so `generator: fullJitterGenerator` added to match the brief's "full jitter". | context7 `/connor4312/cockatiel` + source read of `dist/RetryPolicy.js:62` (`retries < this.options.maxAttempts`); `fullJitterGenerator` is an exported generator |
| 38 | `resilience.md:44–57` | 429 and 5xx now throw so the retry policy and breaker count them; a returned `Response` counted as success. Other 4xx returned as-is. Response body cancelled before retry. | Plain logic defect in our snippet; cockatiel counts a resolved value as success |
| 42 | `resilience.md:182` | `catch {` → `catch (err) {`; `err` was referenced but undeclared. | Plain bug in our snippet |
| 13 | `resilience.md:157–171` | Outbox relay now claims rows with `for update skip locked` inside a short transaction and dispatches after commit; previously the lock ended before dispatch. Noted `outbox.id` is a UUID so it is a legal colon-free `jobId`. | Brief ruling "relay job polls every `5s`, `limit(100)`, `for("update", { skipLocked: true })`" |
| 71 | `resilience.md:79` | Open duration table said `60 s` while the snippet used `halfOpenAfter: 30_000`. Set to `30 s` and removed the invented "observation window" prose and stale `verify:`. | Contradiction with the brief (`half-open after 30s`) and with the same file's snippet |
| 31 | `caching.md:93–102` | Single-flight map entry now deleted in `finally`, so a rejected loader is not retained and served forever. | Plain bug in our snippet |
| 33 (logging only) | `caching.md:105–108` | `void l2.delete(key)` → `.catch()` that logs at `error`. Silent failure removed. Invalidation kept synchronous. | Plain bug (swallowed rejection); redesign to async dropped per scope |
| 35 | `caching.md:21, 179` | `@keyv/redis` runs on `@redis/client`, not ioredis, and owns its own connection. Removed the unused `cacheRedis` ioredis handle; `src/server/lib/redis.ts` now exports only the BullMQ ioredis client. Added `closeL2()` via `keyvRedis.disconnect()` for shutdown. | context7 `/jaredwray/keyv` — "The Redis storage adapter for Keyv is built on top of @redis/client"; `disconnect([force])` documented |
| G2 | `caching.md` (write-path section) | Added `updateOrgSettings` → `db.transaction` → `invalidateOrgSettings(orgId)` after commit, replacing the bare snippet. | Brief ruling "write path invalidates after commit" |
| 37 | `observability.md:141–154` | `Logger.logQuery(query, params)` has no duration and runs before execution, so it cannot detect slow queries. Replaced with a `timed()` call-site wrapper used in `queries.ts`; noted postgres-js `debug` also carries no duration. | Source read of `drizzle-orm@1.0.0-rc.4` `logger.d.ts` (`logQuery(query: string, params: unknown[]): void`); context7 `/porsager/postgres` `debug` signature |
| 27 (observability half) | `observability.md:225–239` | postgres-js takes no `AbortSignal` on a query. Replaced with a `Promise.race` against a rejecting 1000 ms timer, cleared in `finally`. | context7 `/porsager/postgres` — no AbortSignal option; timeout done via `Promise.race` |
| 23 | `server-runtime.md:18–21` | `await runMigrations()` added before `Bun.serve` and before `registerWorkers()`. | Brief ruling "`migrate()` at boot under `pg_advisory_lock` before `serve`" |
| 29 | `server-runtime.md:203–205` | t3-env `isServer` guards property access through a Proxy, not the import. Added an explicit top-level `if (typeof window !== "undefined") throw` and corrected the misleading comment. | context7 `/t3-oss/t3-env` — Proxy `get` trap calls `onInvalidAccess` on property read |
| 30 | `server-runtime.md:249–254` | Final image now copies `dist/client` (from a new build stage running `bun run build`) and `drizzle/`. | Brief rulings: SPA served from `dist/client`; migration folder committed and replayed at boot |

Confirmed already fixed in `server-runtime.md`, not redone: rows 24 (hard-exit timer inside `shutdown`), 26 (drain and worker-close races), 27 (readiness 1 s race), 28 (Next variant on `@hono/node-server` with `RESPONSE_ALREADY_SENT`).

## Dropped

| Codex # | Reason |
| --- | --- |
| 32 | Cache fencing by key generation/version — design addition beyond the researched sources; out of narrowed scope. |
| 33 (redesign) | Making `invalidate()` async and awaiting the L2 delete before acknowledging — redesign beyond scope. Only the swallowed-error bug was fixed. |
| 34 | Auth-cache tier redesign (L1-only `user:{id}` helper in `caching.md`). `auth.md` owns the auth cache; SKILL.md already states L1-only TTL `5m`. Applied then reverted per scope change. |
| 36 | `autoInvalidate: false` discussion for Drizzle cache. Option name verified real, but the guidance is a design addition; out of narrowed scope. Applied then reverted. |
| 39 | Idempotency-key header plumbing into the provider request — design addition; out of scope. |
| 40 | `Retry-After`-aware `DelegateBackoff`. Codex is factually right that `ExponentialBackoff` ignores `retryAfter` (confirmed: no such reference in cockatiel dist), but the fix is a design addition. The false "backs off using Retry-After" comment disappeared with the row-38 rewrite. |
| 5 | Origin check breadth across `/api` and `/admin` — `auth.md` scope, not these five files. |
| 49, 50, 51, 52, 53, 54, 55, 61, 65, 66, 67, 68, 69, 70, 72 | MEDIUM rows that are style preferences, cross-file consistency nits, or design additions beyond the researched sources. |
| 82, 86, 87, 88 | LOW rows: heading wording, `verify:` marker tidiness, motivation-prose trims. Style only. |

