<!-- Adapted from addyosmani/agent-skills (MIT), orpc-official/skills (MIT), testcontainers/testcontainers-node (MIT). See NOTICE.md -->

Use this reference for `bun test` layout, service tests with fake ports, Postgres integration via Testcontainers, router tests, job processor tests, and coverage config.

## Test file layout

Files live beside the code they test. No separate `__tests__/` directory.

```
src/server/modules/invoice/
  table.ts
  queries.ts
  service.ts
  router.ts
  jobs.ts
  service.test.ts      ← service + queries
  router.test.ts       ← oRPC procedure calls
  jobs.test.ts         ← processor called directly
```

## `bunfig.toml` test config

```toml
[test]
preload = ["./src/test/setup.ts"]   # env vars + DB URL before any test file
timeout = 10000                      # ms per test
```

`src/test/setup.ts` reads `.env.test` and exports nothing; side-effect only.

## Service tests with fake ports

Implement the port interface in-memory. Never mock Drizzle.

```ts
// lib/ports/mailer.ts
export interface Mailer {
  send(to: string, subject: string, html: string): Promise<void>
}

// src/test/fakes/fake-mailer.ts
import type { Mailer } from '../../lib/ports/mailer'

export class FakeMailer implements Mailer {
  readonly sent: Array<{ to: string; subject: string; html: string }> = []

  async send(to: string, subject: string, html: string): Promise<void> {
    this.sent.push({ to, subject, html })
  }
}
```

Use in a service test:

```ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'bun:test'
import { FakeMailer } from '../../test/fakes/fake-mailer'
import { InvoiceService } from './service'
import { db, migrate, truncate, teardown } from '../../test/db'

let service: InvoiceService
let mailer: FakeMailer

beforeAll(async () => {
  await migrate()
  mailer = new FakeMailer()
  service = new InvoiceService(db, mailer)
})

afterAll(() => teardown())
afterEach(() => truncate())

it('sends an email after invoice creation', async () => {
  await service.createAndSend({ orgId: 'org-1', amount: 5000, currency: 'USD' })
  expect(mailer.sent).toHaveLength(1)
  expect(mailer.sent[0].subject).toContain('Invoice')
})
```

## Integration tests with Testcontainers

One container per test file. `@testcontainers/postgresql` starts a real Postgres container.

```ts
// src/test/db.ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { migrate as drizzleMigrate } from 'drizzle-orm/postgres-js/migrator'
import { relations } from '../server/db/relations'

let container: StartedPostgreSqlContainer | undefined
let sql: ReturnType<typeof postgres>
export let db: ReturnType<typeof drizzle>

export async function migrate() {
  container = await new PostgreSqlContainer('postgres:17').start()
  sql = postgres(container.getConnectionUri())
  db = drizzle({ client: sql, relations, casing: 'snake_case' })
  await drizzleMigrate(db, { migrationsFolder: './drizzle' })
}

export async function truncate() {
  await sql`TRUNCATE TABLE invoices, outbox RESTART IDENTITY CASCADE`
}

export async function teardown() {
  await sql?.end()
  await container?.stop()
}
```

`relations` and `casing` must match production, or the relational queries and generated SQL under test differ from the deployed ones. `teardown` is separate from `truncate` so a test file can reset between tests and close once at the end.

When the Docker socket is unavailable (CI without Docker), fall back to a `test` service in `compose.yml`:

```yml
services:
  db-test:
    image: postgres:17
    environment:
      POSTGRES_DB: test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    ports: ["5433:5432"]
```

Set `DATABASE_URL=postgres://test:test@localhost:5433/test` in the CI environment and skip container startup when `DATABASE_URL` is already set:

```ts
export async function migrate() {
  if (process.env.DATABASE_URL) {
    sql = postgres(process.env.DATABASE_URL)
  } else {
    container = await new PostgreSqlContainer('postgres:17').start()
    sql = postgres(container.getConnectionUri())
  }
  db = drizzle({ client: sql, relations, casing: 'snake_case' })
  await drizzleMigrate(db, { migrationsFolder: './drizzle' })
}
```

`container` stays `undefined` on this path, so `teardown` closes the client and stops the container only if the fixture started one.

## Router tests via oRPC `call`

`call` runs procedures in-process with no HTTP. Import from `@orpc/server`.

```ts
import { call } from '@orpc/server'
import { invoiceRouter } from './router'
import { db, migrate, truncate, teardown } from '../../test/db'

beforeAll(() => migrate())
afterAll(() => teardown())

const ABSENT_ID = '00000000-0000-7000-8000-000000000000'

function authedContext() {
  return {
    db,
    user: { id: Bun.randomUUIDv7(), role: 'member' as const },
    orgId: Bun.randomUUIDv7(),
    requestId: Bun.randomUUIDv7(),
    headers: new Headers(),
    logger,
  }
}

it('returns NOT_FOUND for unknown invoice', async () => {
  await expect(
    call(invoiceRouter.get, { id: ABSENT_ID }, { context: authedContext() }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' })
})
```

A UUID input schema rejects `'does-not-exist'` with `BAD_REQUEST` before the handler runs, so an absent id must still be a well-formed UUID. The context must satisfy the authenticated `BaseContext` in full, or the auth middleware fails first and the test never reaches `NOT_FOUND`.

## Auth middleware tests

Test the middleware directly by constructing an oRPC context. The middleware reads the `access_token` cookie and verifies the JWT before it looks up the session, so a revocation test needs a validly signed token naming the revoked `sid`.

```ts
it('rejects missing cookie with UNAUTHORIZED', async () => {
  await expect(
    call(protectedProcedure, {}, { context: { headers: new Headers() } }),
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
})

it('rejects revoked session with UNAUTHORIZED', async () => {
  const { sid, userId } = await seedSession(db)
  await revokeSession(db, sid)

  const token = await signAccessToken({ sub: userId, sid, role: 'member' })
  const headers = new Headers({ cookie: `access_token=${token}` })

  await expect(
    call(protectedProcedure, {}, { context: { db, headers } }),
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
})
```

## Job processor tests

Call `processor` directly with a fake `Job`. Both calls live in one test, so the assertion does not depend on another test having run first.

```ts
import type { Job } from 'bullmq'
import { processor } from './jobs'
import { db, migrate, truncate, teardown } from '../../test/db'

function fakeJob(data: Record<string, unknown>): Job {
  return { id: 'job-1', data, attemptsMade: 0, queueName: 'invoice.send' } as unknown as Job
}

beforeAll(() => migrate())
afterAll(() => teardown())

it('sends the invoice email exactly once across two runs', async () => {
  const invoiceId = await seedInvoice(db, { orgId })
  const job = fakeJob({ orgId, invoiceId })

  await processor(job)
  await processor(job)

  const [row] = await db
    .select({ sentAt: invoices.sentAt })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
  expect(row.sentAt).not.toBeNull()
  expect(mailer.sent).toHaveLength(1)
})
```

## Keyset pagination test

Seed 120 rows, walk all pages, assert no gaps or duplicates.

```ts
it('keyset pagination has no gaps or duplicates', async () => {
  await seedInvoices(db, 120)

  const seen = new Set<string>()
  let cursor: string | undefined

  while (true) {
    const page = await call(
      invoiceRouter.list,
      { cursor, limit: 20 },
      { context: authedContext() },
    )
    for (const row of page.items) {
      expect(seen.has(row.id)).toBe(false)
      seen.add(row.id)
    }
    cursor = page.nextCursor
    if (!cursor) break
  }

  expect(seen.size).toBe(120)
})
```

## Migration smoke test

```ts
it('migrates a fresh DB and responds to select 1', async () => {
  await migrate()
  const [row] = await sql`select 1 as n`
  expect(row.n).toBe(1)
})
```

## Coverage config

```toml
[test]
coverageThreshold = { lines = 0.8, functions = 0.8 }
```

Thresholds are fractions, not percentages, and Bun checks them per file, not against the aggregate. Bun accepts a `statements` key but does not enforce it.

Run with:

```sh
bun test --coverage
```

Coverage target: every branch in every `service.ts` and every query with a `where` clause.

## CI matrix line

```yaml
- name: Test
  env:
    DATABASE_URL: postgres://test:test@localhost:5433/test
  run: bun test --coverage
```

Start the compose `db-test` service before this step, or let `DATABASE_URL` absence trigger `PostgreSqlContainer` inside the test suite.

## Before you finish

| Check | Fix |
| --- | --- |
| Drizzle mocked with `jest.mock` or `mock()` | Remove mock; use real Postgres via Testcontainers |
| `TRUNCATE` missing `RESTART IDENTITY CASCADE` | Add both clauses to reset sequences and FK rows |
| Router test uses HTTP fetch instead of `call` | Import `call` from `@orpc/server` and call directly |
| Processor test does not assert idempotency | Call the processor twice in one test and assert the side-effect count is unchanged |
| Pagination test checks only first page | Loop until `nextCursor` is `undefined`; count total rows |
| No migration smoke test | Add a test file that calls `migrate()` and runs `select 1` |
| `drizzle(sql, { schema })` in the test fixture | `drizzle({ client: sql, relations, casing: 'snake_case' })`, matching production |
| `container.stop()` called unconditionally | Type `container` as optional and stop only a fixture-owned one; always `await sql?.end()` |
| Router test id that is not a UUID | Use a well-formed absent UUID; a bad one fails input validation with `BAD_REQUEST` |
| Partial oRPC context in a router test | Supply the full authenticated `BaseContext`: `db`, `user`, `orgId`, `requestId`, `headers`, `logger` |
| `bun:test` missing from imports | Use `import { describe, it, expect, beforeAll, afterAll, afterEach } from 'bun:test'` |
