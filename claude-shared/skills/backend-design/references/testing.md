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
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { FakeMailer } from '../../test/fakes/fake-mailer'
import { InvoiceService } from './service'
import { db, migrate, truncate } from '../../test/db'

let service: InvoiceService
let mailer: FakeMailer

beforeAll(async () => {
  await migrate()
  mailer = new FakeMailer()
  service = new InvoiceService(db, mailer)
})

afterAll(() => truncate())

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
import * as schema from '../server/db/schema'

let container: StartedPostgreSqlContainer
let sql: ReturnType<typeof postgres>
export let db: ReturnType<typeof drizzle>

export async function migrate() {
  container = await new PostgreSqlContainer('postgres:17').start()
  sql = postgres(container.getConnectionUri())
  db = drizzle(sql, { schema })
  await drizzleMigrate(db, { migrationsFolder: './drizzle' })
}

export async function truncate() {
  await sql`TRUNCATE TABLE invoices, outbox RESTART IDENTITY CASCADE`
  await sql.end()
  await container.stop()
}
```

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
  db = drizzle(sql, { schema })
  await drizzleMigrate(db, { migrationsFolder: './drizzle' })
}
```

## Router tests via oRPC `call`

`call` runs procedures in-process with no HTTP. Import from `@orpc/server`.

```ts
import { call } from '@orpc/server'
import { invoiceRouter } from './router'
import { db, migrate, truncate } from '../../test/db'

beforeAll(() => migrate())
afterAll(() => truncate())

it('returns NOT_FOUND for unknown invoice', async () => {
  await expect(
    call(invoiceRouter.get, { id: 'does-not-exist' }, {
      context: { db, userId: 'user-1', orgId: 'org-1' },
    }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' })
})
```

## Auth middleware tests

Test the middleware directly by constructing a minimal oRPC context.

```ts
it('rejects missing cookie with UNAUTHORIZED', async () => {
  await expect(
    call(protectedProcedure, {}, { context: { headers: new Headers() } }),
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
})

it('rejects revoked session with UNAUTHORIZED', async () => {
  const headers = new Headers({ cookie: 'sid=revoked-session-id' })
  await expect(
    call(protectedProcedure, {}, { context: { headers } }),
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
})
```

## Job processor tests

Call `processor` directly with a fake `Job`. Assert idempotency by calling twice.

```ts
import type { Job } from 'bullmq'
import { processor } from './jobs'
import { db, migrate, truncate } from '../../test/db'

function fakeJob(data: Record<string, unknown>): Job {
  return { id: 'job-1', data, attemptsMade: 0, queueName: 'invoice.send' } as unknown as Job
}

beforeAll(() => migrate())
afterAll(() => truncate())

it('sends invoice email', async () => {
  const job = fakeJob({ invoiceId: 'inv-1' })
  await processor(job)
  // assert side effect
})

it('is idempotent on second call', async () => {
  const job = fakeJob({ invoiceId: 'inv-1' })
  await processor(job) // second call; must not double-send
  // assert sent count is still 1
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
      { context: { db, userId: 'u-1', orgId: 'org-1' } },
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
coverageThreshold = { line = 80 }
```

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
| Processor test does not assert idempotency | Add second call and assert side-effect count is unchanged |
| Pagination test checks only first page | Loop until `nextCursor` is `undefined`; count total rows |
| No migration smoke test | Add a test file that calls `migrate()` and runs `select 1` |
| `bun:test` missing from imports | Use `import { describe, it, expect, beforeAll, afterAll } from 'bun:test'` |
