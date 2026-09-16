<!-- Adapted from oRPC official skills, addyosmani/agent-skills, aj-geddes/useful-ai-prompts, ccheney/robust-skills (MIT). See NOTICE.md -->

The oRPC v2 layer: builder, context, middleware, typed errors, pagination, idempotency, OpenAPI, client, and tRPC migration.

oRPC v2 ships under the `beta` dist-tag: `bun add @orpc/server@beta @orpc/client@beta`. A plain install silently gets v1. Pretrained oRPC knowledge describes v1 and is wrong here — routing moved to `.meta(openapi(...))`, `RPCLink` split `url` into `origin` plus a path, automatic middleware dedupe was removed.

## Declare context once on the base builder

`os.$context<T>()` declares the initial context every procedure requires. The handler passes it at serve time; middleware adds runtime values with `next({ context })`.

```ts
// src/server/rpc/base.ts
import { os } from "@orpc/server";
import type { Logger } from "pino";
import type { Database, Transaction } from "../db";

export type BaseContext = {
  db: Database | Transaction;
  logger: Logger;
  requestId: string;
  headers: Headers;
  user: { id: string; orgId: string; role: string } | null;
  org: { id: string; name: string } | null;
};

export const base = os.$context<BaseContext>();
```

`user` and `org` are nullable on the base context. Auth middleware narrows them to non-null for the procedures that need them.

## Every procedure logs timing and honours `meta.useTransaction`

Two middlewares on the base builder: one times and logs the call, one opens `db.transaction` and swaps `context.db` for the `tx` when `meta.useTransaction` is set.

```ts
// src/server/rpc/base.ts
import { defineMeta } from "@orpc/server";
import { db as rootDb } from "../db";

export const [useTransaction, getUseTransaction] = defineMeta(
  "useTransaction",
  (incoming: boolean) => incoming,
);

const timing = base.middleware(async ({ context, next, path }) => {
  const startedAt = performance.now();
  const log = (status: string) =>
    context.logger.info(
      { procedure: path.join("."), durationMs: Math.round(performance.now() - startedAt), status },
      "rpc",
    );
  try {
    const result = await next();
    log("ok");
    return result;
  } catch (error) {
    log("error");
    throw error;
  }
});

export const procedure = base
  .use(timing)
  .use(async ({ context, next, procedure: p }) => {
    if (getUseTransaction(p) !== true) return next();
    return rootDb.transaction(async tx => {
      const orgId = context.org?.id;
      if (orgId) {
        await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
      }
      return next({ context: { db: tx } });
    });
  });
```

`set_config(..., true)` is the transaction-local form of `SET LOCAL app.org_id`, which the tenant RLS policies read. Without it every policy on the `tx` evaluates against an unset setting and matches nothing. Tenant-scoped reads need the same scope, so mark them `useTransaction(true)` as well.

`defineMeta(key, merge)` returns a setter and a getter pair. `.$meta<T>({})` on the builder plus `procedure["~orpc"].meta` in middleware is the v1 form and was removed in v2.

Mark a procedure transactional at definition:

```ts
export const voidInvoice = authed
  .meta(useTransaction(true))
  .input(z.object({ id: z.uuid() }))
  .handler(({ input, context }) => voidInvoiceService(context.db, input.id));
```

The service receives `context.db`, which is the `tx` inside a transactional procedure. Never open a transaction inside a service that already received a `tx`.

## Build the namespace from the base builder

Every builder step returns a new instance, so derive the whole namespace once and import it everywhere. Four names: `pub`, `authed`, `withRole()`, `withPermission()`.

```ts
// src/server/rpc/procedures.ts
import { ORPCError } from "@orpc/server";
import { procedure } from "./base";

export const pub = procedure;

export const authed = procedure.use(async ({ context, next }) => {
  if (!context.user || !context.org) throw new ORPCError("UNAUTHORIZED");
  return next({ context: { user: context.user, org: context.org } });
});

export const withRole = (...roles: string[]) =>
  authed.use(async ({ context, next }) => {
    if (!roles.includes(context.user.role)) throw new ORPCError("FORBIDDEN");
    return next();
  });

export const withPermission = (...required: string[]) =>
  authed.use(async ({ context, next }) => {
    const granted = await loadPermissions(context.db, context.user.id);
    if (!required.every(p => granted.has(p))) throw new ORPCError("FORBIDDEN");
    return next();
  });
```

Applying `.use` at both router level and procedure level runs the same middleware twice — v2 removed automatic dedupe. Cache expensive middleware behind a context flag: `if (context.permissionsLoaded) return next()`, otherwise load and `return next({ context: { permissions, permissionsLoaded: true } })`.

## Derive input schemas from the table, allow-list the client fields

Zod 4, one version: `import { z } from "zod"`. Table-derived schemas come from `drizzle-orm/zod` on Drizzle v1 — never the standalone `drizzle-zod` package.

```ts
import { createInsertSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { invoices } from "./table";

export const createInvoiceInput = createInsertSchema(invoices, {
  amountMinor: schema => schema.positive(),
  currency: schema => schema.length(3),
})
  .pick({ number: true, amountMinor: true, currency: true, dueAt: true, customerId: true })
  .extend({ idempotencyKey: z.uuid() });
```

`.pick()` is an allow-list: a column added in a later migration is not client-writable by default. Server-owned columns — `id`, `orgId`, `createdAt`, `updatedAt`, `deletedAt`, `createdBy`, `updatedBy` — are never picked; `orgId` comes from the authenticated context.

Refinement callbacks extend the generated field schema; passing a bare Zod schema replaces it including its nullability.

## Output schemas are required on OpenAPI-exposed procedures

`.output` is optional for RPC-only procedures but speeds up type checking. It is mandatory for anything served through `OpenAPIHandler`, because the generator reads it to emit the response schema.

```ts
const invoiceOutput = z.object({
  id: z.uuid(),
  number: z.string(),
  amountMinor: z.number().int(), // bigint({ mode: "number" }); ceiling 2^53 - 1 minor units
  currency: z.string().length(3),
  createdAt: z.iso.datetime(),
});

export const get = authed
  .meta(openapi({ method: "GET", path: "/invoices/{id}" }))
  .input(z.object({ id: z.uuid() }))
  .output(invoiceOutput)
  .handler(({ input, context }) => getInvoice(context.db, context.org.id, input.id));
```

Money stays a `bigint` column in minor units, read with `bigint({ mode: "number" })` so the row yields a JS number that `z.number().int()` accepts. The ceiling is `2^53 - 1` minor units — about `90` trillion in a two-decimal currency. Switch that column to `mode: "bigint"` and the output field to `z.string()` if a single amount can exceed it.

A `mode: "string"` timestamp column reads back as the Postgres text form (`2026-09-16 10:00:00.123+00`), which `z.iso.datetime()` rejects. Convert in the query with `sql\`to_char(...)\``, or read the column as `mode: "date"` and call `.toISOString()` in the handler.

Return entity fields explicitly. Never spread a table row into the response — new columns leak on the next migration.

## Declare typed errors per procedure with `requestId` in `data`

`.errors({...})` gives the client an inferable shape per code. `message` and `data` both reach the client, so they never carry stack traces, SQL, or secrets.

Codes in use: `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `TOO_MANY_REQUESTS`, `INTERNAL_SERVER_ERROR`.

```ts
import { z } from "zod";

const errorData = z.object({ requestId: z.string() });

export const voidInvoice = authed
  .errors({
    NOT_FOUND: { message: "Invoice not found", data: errorData },
    CONFLICT: { message: "Invoice already voided", data: errorData },
  })
  .input(z.object({ id: z.uuid() }))
  .output(invoiceOutput)
  .handler(async ({ input, context, errors }) => {
    const invoice = await findInvoice(context.db, context.org.id, input.id);
    if (!invoice) throw errors.NOT_FOUND({ data: { requestId: context.requestId } });
    if (invoice.voidedAt) throw errors.CONFLICT({ data: { requestId: context.requestId } });
    return voidInvoiceService(context.db, invoice);
  });
```

Throwing `new ORPCError("NOT_FOUND")` inside that handler converts to the matching typed error when code and data match. Throw `Error` instances only, never literals. Skip explicit schemas for `UNAUTHORIZED` and `TOO_MANY_REQUESTS`: the client already understands them and the extra types slow typechecking.

`status` was removed from `ORPCError` and from `.errors` definitions in v2. Map codes to HTTP status with `errorStatusMap` on the handler.

## Map unknown errors in an `onError` interceptor

Anything that is not an `ORPCError` is a bug or an outage. Log it at `error` with the full object, then return `INTERNAL_SERVER_ERROR` carrying only the `requestId`.

```ts
// src/server/rpc/handler.ts
import { ORPCError, onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { router } from "./router";

export const rpcHandler = new RPCHandler(router, {
  interceptors: [
    onError((error, { context }) => {
      if (error instanceof ORPCError) return;
      context.logger.error({ err: error, requestId: context.requestId }, "unhandled rpc error");
    }),
    async ({ next, context }) => {
      try {
        return await next();
      } catch (error) {
        if (error instanceof ORPCError) throw error;
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          data: { requestId: context.requestId },
          cause: error,
        });
      }
    },
  ],
});
```

`cause` stays server-side; oRPC does not serialise it. `RPCHandler` accepts only `POST`, `PUT`, `PATCH`, and `DELETE` by default — enabling `GET` via `allowMethods` is a CSRF risk with cookie auth.

## Keyset pagination over `(createdAt desc, id desc)`

Offset pagination scans and skips; keyset seeks. Default `limit` is `50`, maximum `100`. The cursor is opaque `base64url` JSON that the client echoes back unchanged.

```ts
// src/server/rpc/pagination.ts
import { decodeBase64url, encodeBase64url } from "@orpc/server/helpers";
import { z } from "zod";

export const pageInput = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

// createdAt is carried as the exact string read from the row, not re-formatted
const cursorShape = z.object({ createdAt: z.string().min(1), id: z.uuid() });
type Cursor = z.infer<typeof cursorShape>;

export const encodeCursor = (c: Cursor): string =>
  encodeBase64url(new TextEncoder().encode(JSON.stringify(c)));

export const decodeCursor = (raw: string | undefined): Cursor | null => {
  if (!raw) return null;
  const bytes = decodeBase64url(raw);
  if (!bytes) return null;
  const parsed = cursorShape.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
  return parsed.success ? parsed.data : null;
};

export const pageOutput = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });
```

The cursor carries `createdAt` exactly as read from the row, so it round-trips into the comparison unchanged. Validating it as `z.iso.datetime()` rejects the Postgres text form that a `mode: "string"` column actually returns (`2026-09-16 10:00:00.123+00`).

An invalid cursor is a client error: throw `BAD_REQUEST`, never fall back to page one silently.

The query seeks past the cursor row with an `or` over the compound key, so rows tied on `createdAt` are neither skipped nor repeated:

```ts
// src/server/modules/invoice/queries.ts
import { and, desc, eq, lt, or } from "drizzle-orm";

export async function listInvoices(db: Database, orgId: string, cursor: Cursor | null, limit: number) {
  const rows = await db
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
    .limit(limit + 1);

  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > limit && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
  };
}
```

Fetch `limit + 1` rows to know whether a next page exists without a second `count` query. Index `(org_id, created_at desc, id desc)` so the seek is an index scan.

## Creates take an idempotency key enforced by a unique index

The client generates a UUID per logical create and resends it on retry. A unique constraint on `(org_id, idempotency_key)` makes the database the arbiter — no read-then-write race.

```ts
// table.ts
export const invoices = pgTable(
  "invoices",
  {
    id: uuid().primaryKey().$defaultFn(() => Bun.randomUUIDv7()),
    orgId: uuid().notNull().references(() => orgs.id, { onDelete: "cascade" }),
    idempotencyKey: uuid().notNull(),
    // ...
  },
  t => [uniqueIndex("invoices_org_idem_uq").on(t.orgId, t.idempotencyKey)],
);
```

```ts
// service.ts
export async function createInvoice(db: Database, orgId: string, input: CreateInvoiceInput) {
  const [created] = await db
    .insert(invoices)
    .values({ ...input, orgId })
    .onConflictDoNothing({ target: [invoices.orgId, invoices.idempotencyKey] })
    .returning();

  if (created) return created;

  const [existing] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.idempotencyKey, input.idempotencyKey)))
    .limit(1);
  return existing;
}
```

A replay returns the existing row with the same success status, not `CONFLICT`. Keep the whole create in one transaction (`.meta(useTransaction(true))`) so side effects enqueued alongside the row commit or roll back with it.

## Router-first by default, contract-first across a boundary

Router-first (`os`) when one codebase holds server and client: the client imports `typeof router` as a type and needs nothing else. Contract-first (`oc` + `implement`) when another team or app consumes the API, when the shape starts from an existing OpenAPI spec, or when publishing a typed client to npm.

Converting later is cheap — a plain router already works as a router contract. Resolve lazy routers with `unlazyRouter` first.

```ts
// src/shared/contract.ts
import { oc } from "@orpc/contract";

export const contract = {
  invoice: {
    get: oc.errors({ NOT_FOUND: {} }).input(z.object({ id: z.uuid() })).output(invoiceOutput),
  },
};

// src/server/rpc/router.ts
import { implement } from "@orpc/server";

const impl = implement(contract).$context<BaseContext>();

export const router = impl.router({
  invoice: { get: impl.invoice.get.handler(({ input, context }) => getInvoice(context.db, input.id)) },
});
```

Always set `.output` on a contract procedure — without it the client infers `unknown`. Contract-level `.use(mw)` runs before input validation; procedure-level `.use` runs after.

## Serve OpenAPI from the same router

Both handlers accept the same router. Mount them on different prefixes and try each in turn.

```ts
// src/server/app.ts
import { OpenAPIGenerator } from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferenceHandlerPlugin } from "@orpc/openapi/plugins";
import { SmartCoercionHandlerPlugin } from "@orpc/json-schema";
import { ZodToJsonSchemaConverter } from "@orpc/zod";

const converters = [new ZodToJsonSchemaConverter()];
const generator = new OpenAPIGenerator({ converters });

export const apiHandler = new OpenAPIHandler(router, {
  plugins: [
    new SmartCoercionHandlerPlugin({ converters }),
    new OpenAPIReferenceHandlerPlugin({
      spec: () => generator.generate(router, {
        base: { info: { title: "API", version: "1.0.0" }, servers: [{ url: "/api" }] },
      }),
    }),
  ],
});
```

Route metadata lives in `.meta(openapi({...}))` from `@orpc/openapi`, on `os` and `oc` alike. A procedure defaults to `POST` at a path derived from the router key (`invoice.create` becomes `POST /invoice/create`).

- Path params: `{id}` in `path` plus a required field of the same name in the input schema. `{+path}` for catch-all segments containing `/`.
- `prefix` prepends to a procedure or a whole router; always set one on lazy routers so lazy loading only fires for relevant requests.
- Across repeated `.meta(openapi(...))` calls, `prefix` and `tags` concatenate; `method`, `path`, and `successStatus` are last-wins.
- `successStatus` defaults to `200` and must be below `400`.
- `SmartCoercionHandlerPlugin` is required whenever an input schema expects a non-string from a query, path, or form value — those always arrive as strings.

`OpenAPIGenerator` emits OpenAPI 3.2; pass a `3.1.x` or `3.0.x` `version` for tools that stop at an older spec.

## Client: `RPCLink` plus TanStack Query utils

Import the router as a type only, so no server code reaches the client bundle.

```ts
// src/client/lib/orpc.ts
import type { RouterClient } from "@orpc/server";
import type { router } from "../../server/rpc/router";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

const link = new RPCLink({
  origin: window.location.origin,
  url: "/rpc", // must match the handler prefix
  fetch: (request, init) => globalThis.fetch(request, { ...init, credentials: "include" }),
});

export const client: RouterClient<typeof router> = createORPCClient(link);
export const orpc = createTanstackQueryUtils(client);
```

`origin` and `url` are separate in v2; a single combined `url` is the v1 form. Usage: `orpc.invoice.get.queryOptions({ input: { id } })`, `orpc.invoice.create.mutationOptions()`, and `orpc.invoice.list.infiniteOptions({ input: cursor => ({ cursor }), initialPageParam: undefined, getNextPageParam: last => last.nextCursor })`.

Typed error handling on the client uses `safe`, which preserves inference where `try/catch` loses it:

```ts
import { isDefinedError, safe } from "@orpc/client";

const [error, data] = await safe(client.invoice.get({ id }));
if (isDefinedError(error)) {
  // error.code and error.data typed from the procedure's .errors
}
```

In v2 `safe()` returns a four-element tuple: the third element is the typed error itself or `null`, the fourth is `isSuccess`.

## Add fields; rename by adding a procedure

New optional input fields and new output fields are additive and ship freely. Anything else — removing a field, narrowing a type, changing a field's meaning, making an optional input required — is breaking.

A breaking change becomes a new procedure name (`list` stays, `listV2` appears). Keep the old procedure for at least one release, log its calls at `info` with `deprecated: true`, then remove it once the logs go quiet. Never version the whole router.

`.input` and `.output` stack in v2: a repeated call adds a schema rather than replacing it. Object input schemas compose into one flat value; output schemas pipe. Use that to extend a base contract without repeating fields.

## tRPC to oRPC

Two paths. Incremental: install `@orpc/trpc@beta` and wrap with `toORPCRouter(trpcRouter)`, then rewrite leaf routers one at a time. Full rewrite when the router is small enough for one pass.

| Concept | tRPC | oRPC v2 |
| --- | --- | --- |
| Router | `t.router({...})` | plain object |
| Procedure builder | `t.procedure` | `os` |
| Context type | `initTRPC.context<T>()` | `os.$context<T>()` |
| Context in handler | `ctx` | `context` |
| Create middleware | `t.middleware(fn)` | `os.middleware(fn)` |
| Validation | `.input(schema)` / `.output(schema)` | same names |
| Implementation | `.query()` / `.mutation()` / `.subscription()` | `.handler()` for all three |
| Errors | `new TRPCError({ code })` | `new ORPCError(code, { data })` |
| Serializer | `superjson` transformer | built in; remove `superjson` |
| Adapter | framework tRPC adapter | `RPCHandler` from `@orpc/server/fetch` |
| Client | `createTRPCClient` + `httpBatchLink` | `createORPCClient` + `RPCLink` |
| Query integration | `TRPCProvider` + `useTRPC()` | `createTanstackQueryUtils(client)` |
| Query input | `trpc.x.queryOptions(input)` | `orpc.x.queryOptions({ input })` |

Steps in order, typechecking after each: packages, base file, procedures, app router, server adapter, client, TanStack Query. Drop `.query()`/`.mutate()` suffixes at call sites.

Error shape changes: with `toORPCRouter`, tRPC errors arrive wrapped in `ORPCError` with the `TRPCError` as `cause` (and a `ZodError` below it for validation failures). Reshape in a handler interceptor if consumers need structured errors.

## Before you finish

| Detection | Fix |
| --- | --- |
| `@orpc/*` installed at `1.x` | Install from the `beta` dist-tag; v1 and v2 links cannot talk to each other |
| `.route({ method, path })` on a procedure | `.meta(openapi({ method, path }))` from `@orpc/openapi` |
| `new RPCLink({ url: "http://host/rpc" })` | Split into `origin` plus a path-only `url` |
| `status` passed to `ORPCError` or `.errors` | Removed in v2; map codes with `errorStatusMap` on the handler |
| `.$meta<T>({})` or `procedure["~orpc"].meta` | v1 form; use `defineMeta(key, merge)` and its getter |
| `import { createInsertSchema } from "drizzle-zod"` | `from "drizzle-orm/zod"` on Drizzle v1 |
| Procedure served over OpenAPI with no `.output` | Add the output schema; the generator has nothing to emit without it |
| Handler returns a spread table row | List response fields explicitly so new columns cannot leak |
| `orgId` accepted in an input schema | Take it from `context.org.id`; `.pick()` the client fields on the derived schema |
| Derived insert schema built with `.omit()` | `.pick()` the client fields; an omit list lets the next migration's column through |
| Transactional middleware without `set_config('app.org_id', ...)` | Tenant RLS policies match nothing on that `tx` |
| `limit`/`offset` in a list input | Keyset `{ limit, cursor }`; offset only for admin tables under 10k rows |
| Cursor is a plain id or a raw timestamp | Opaque `base64url` JSON over `(createdAt, id)`, validated on decode |
| List query fetches exactly `limit` rows | Fetch `limit + 1` to derive `nextCursor` without a `count` |
| Create procedure with no `idempotencyKey` | Add `z.uuid()` input plus unique `(org_id, idempotency_key)` and `onConflictDoNothing` |
| Raw `Error` reaching the client | `onError` interceptor logs it and returns `INTERNAL_SERVER_ERROR` with `requestId` |
| Error `data` carries a stack, SQL, or a secret | `data` is client-visible; carry `requestId` only |
| `allowMethods` includes `GET` with cookie auth | Remove it; POST-only RPC is the CSRF defence |
| Same middleware at router and procedure level | v2 removed dedupe — guard with a context flag |
| Field removed or narrowed on an existing procedure | New procedure name (`listV2`); keep the old one one release |
| `db.transaction` inside a service that received `tx` | Service takes `db \| tx` as the first argument and never nests |
| `console.log` anywhere in the layer | `context.logger` |
