<!-- Adapted from oRPC official skills (MIT). See NOTICE.md -->

Cookie-based JWT auth on Bun: signing, session revocation, the oRPC middleware, RBAC, CSRF, rate limiting, and password hashing.

## Sign with fast-jwt, verify through its own LRU

HS256 with a 32-byte `AUTH_SECRET`. Two signers — access `15m`, refresh `30d` — and one verifier per token kind. The verifier's `cache` is the JWT cache; never put tokens in Redis.

```ts
// src/server/lib/tokens.ts
import { createSigner, createVerifier } from "fast-jwt";
import { env } from "../env/server";

const key = env.AUTH_SECRET; // 32 bytes

export const signAccessToken = createSigner({ key, algorithm: "HS256", expiresIn: "15m" });
export const signRefreshToken = createSigner({ key, algorithm: "HS256", expiresIn: "30d" });

export const verifyToken = createVerifier({
  key,
  algorithms: ["HS256"],
  cache: 1000,
  cacheTTL: 10 * 60 * 1000, // 10m
});
```

`algorithms` must be pinned on the verifier. An empty array accepts every algorithm, which allows an attacker-chosen `alg`. `createSigner` returns a synchronous function when `key` is a string or buffer, and an async one when `key` is a function.

## The token carries four claims

`sub` (user id), `sid` (session id), `role`, `exp`. Nothing else.

```ts
const accessToken = signAccessToken({ sub: user.id, sid: session.id, role: user.role });
```

Everything else — email, org, permissions, feature flags — is loaded server-side from the cached user record. A claim in a JWT cannot be revoked before `exp`; a lookup can. Refresh tokens carry `sub` and `sid` only, so a stolen refresh token cannot assert a role.

## Cookies are httpOnly, Secure, SameSite=Lax, Path=/

Both tokens are cookies. The client never reads them, so no `localStorage` and no bearer handling in the SPA.

```ts
// src/server/modules/auth/cookies.ts
import type { Context } from "hono";

const base = { httpOnly: true, secure: true, sameSite: "Lax", path: "/" } as const;

export function setAuthCookies(c: Context, accessToken: string, refreshToken: string) {
  c.header("Set-Cookie", serialize("access_token", accessToken, { ...base, maxAge: 15 * 60 }), { append: true });
  c.header("Set-Cookie", serialize("refresh_token", refreshToken, { ...base, maxAge: 30 * 24 * 60 * 60 }), { append: true });
}
```

`SameSite=Strict` breaks OAuth callbacks and email links; `Lax` plus POST-only RPC is the defence. `Secure` stays on in development — Bun serves `localhost`, which browsers treat as a secure context.

## Refresh rotates the session id

Every refresh issues a new access token *and* a new refresh token, and revokes the old `sid`. A refresh token presented twice means it was stolen: revoke the whole session family and force re-login.

```ts
export async function refresh(db: Database, refreshToken: string) {
  const claims = verifyToken(refreshToken);
  const session = await findSession(db, claims.sid);
  if (!session || session.revokedAt) {
    await revokeUserSessions(db, claims.sub); // replay: kill everything
    throw new ORPCError("UNAUTHORIZED");
  }
  await revokeSession(db, claims.sid);
  return issueSession(db, claims.sub);
}
```

## `sessions` is the revocation list

The JWT proves the claims; the row proves the session is still alive.

```ts
// src/server/modules/auth/table.ts
import { index, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../user/table";

export const sessions = pgTable(
  "sessions",
  {
    sid: uuid().primaryKey().$defaultFn(() => Bun.randomUUIDv7()),
    userId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp({ withTimezone: true, mode: "string", precision: 3 }).notNull(),
    revokedAt: timestamp({ withTimezone: true, mode: "string", precision: 3 }),
    createdAt: timestamp({ withTimezone: true, mode: "string", precision: 3 }).defaultNow().notNull(),
  },
  t => [index("sessions_user_id_idx").on(t.userId)],
);
```

Logout sets `revokedAt` and deletes the L1 key. A role change revokes every session for that user, so the new role cannot wait out a stale token.

## Check `session:{sid}` in L1 for 5m, then the database

The session check runs on every request, so it cannot be a database round trip every time. L1 is in-process `lru-cache`, max `10_000` entries, TTL `5m`. That TTL is the revocation lag ceiling: a logout takes effect within `5m` on other processes, immediately on the one that handled it.

```ts
// src/server/modules/auth/session-cache.ts
import { LRUCache } from "lru-cache";

const SESSION_TTL_MS = 5 * 60 * 1000;
const sessionCache = new LRUCache<string, { userId: string; valid: boolean }>({
  max: 10_000,
  ttl: SESSION_TTL_MS,
});

export async function loadSession(db: Database, sid: string) {
  const cached = sessionCache.get(`session:${sid}`);
  if (cached) return cached.valid ? cached : null;

  const [row] = await db.select().from(sessions).where(eq(sessions.sid, sid)).limit(1);
  const valid = Boolean(row) && !row.revokedAt && row.expiresAt > new Date().toISOString();
  sessionCache.set(`session:${sid}`, { userId: row?.userId ?? "", valid });
  return valid ? { userId: row.userId, valid } : null;
}

export const invalidateSession = (sid: string) => sessionCache.delete(`session:${sid}`);
```

Cache the negative result too — a revoked session otherwise hits the database on every replay.

## Cache the user for 5m, invalidate on every `users` write

Same tier, same TTL, same eviction rule. Key `user:{id}`.

```ts
const userCache = new LRUCache<string, User>({ max: 10_000, ttl: 5 * 60 * 1000 });

export async function loadUser(db: Database, id: string) {
  const cached = userCache.get(`user:${id}`);
  if (cached) return cached;
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (row) userCache.set(`user:${id}`, row);
  return row ?? null;
}

export const invalidateUser = (id: string) => userCache.delete(`user:${id}`);
```

Every write path touching `users` calls `invalidateUser` **after** the transaction commits. Invalidating before commit re-populates the cache with the pre-commit row.

## Auth middleware resolves cookie or bearer, then loads session and user

One middleware, applied on the `authed` builder. Cookie first for the SPA, `Authorization: Bearer` second for service-to-service and CLI callers.

```ts
// src/server/rpc/procedures.ts
import { ORPCError, os } from "@orpc/server";
import { getCookie } from "hono/cookie";

type BaseContext = {
  db: Database;
  logger: Logger;
  requestId: string;
  headers: Headers;
  user: { id: string; orgId: string; role: string } | null;
  org: { id: string; name: string } | null;
};

const base = os.$context<BaseContext>();

function readToken(headers: Headers): string | null {
  const cookie = parseCookies(headers.get("cookie") ?? "")["access_token"];
  if (cookie) return cookie;
  const auth = headers.get("authorization");
  return auth?.startsWith("Bearer ") ? auth.slice(7) : null;
}

export const pub = base;

export const authed = base.use(async ({ context, next }) => {
  const token = readToken(context.headers);
  if (!token) throw new ORPCError("UNAUTHORIZED");

  let claims: { sub: string; sid: string; role: string };
  try {
    claims = verifyToken(token);
  } catch {
    throw new ORPCError("UNAUTHORIZED");
  }

  const session = await loadSession(context.db, claims.sid);
  if (!session || session.userId !== claims.sub) throw new ORPCError("UNAUTHORIZED");

  const user = await loadUser(context.db, claims.sub);
  if (!user || user.deletedAt) throw new ORPCError("UNAUTHORIZED");

  const org = await loadOrg(context.db, user.orgId);
  return next({ context: { user, org } });
});
```

`verifyToken` throws on expiry and on a bad signature — both are `UNAUTHORIZED`, never `FORBIDDEN`. The failure message never says which of the two it was. `role` comes from the freshly loaded `user`, not from the token claim: the claim is a hint, the row is the truth.

## Role gates the area, permission gates the action

`role` is an enum column on `users` for coarse areas (`owner`, `admin`, `member`). Fine-grained actions live in a `permissions` lookup table joined through `role_permissions`, so a new permission is a row, not a migration of an enum.

```ts
export const userRole = pgEnum("user_role", ["owner", "admin", "member"]);

export const permissions = pgTable("permissions", {
  id: uuid().primaryKey().$defaultFn(() => Bun.randomUUIDv7()),
  key: text().notNull().unique(), // "invoice:void"
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    role: userRole().notNull(),
    permissionId: uuid().notNull().references(() => permissions.id, { onDelete: "cascade" }),
  },
  t => [primaryKey({ columns: [t.role, t.permissionId] })],
);
```

Permission keys are `resource:action`, lowercase, singular resource: `invoice:void`, `member:invite`.

```ts
export const withRole = (...roles: string[]) =>
  authed.use(async ({ context, next }) => {
    if (!roles.includes(context.user.role)) throw new ORPCError("FORBIDDEN");
    return next();
  });

export const withPermission = (...required: string[]) =>
  authed.use(async ({ context, next }) => {
    const granted = await loadRolePermissions(context.db, context.user.role); // L1, TTL 5m
    if (!required.every(key => granted.has(key))) throw new ORPCError("FORBIDDEN");
    return next();
  });

export const voidInvoice = withPermission("invoice:void")
  .input(z.object({ id: z.uuid() }))
  .handler(({ input, context }) => voidInvoiceService(context.db, context.org.id, input.id));
```

`withRole` and `withPermission` derive from `authed`, so applying both on one procedure runs the auth middleware twice — v2 removed automatic middleware dedupe. Pick one gate per procedure, or guard the shared middleware with a context flag.

Authorisation is not complete at the middleware. Every query still filters by `context.org.id`: a permission says *what* the caller may do, the tenant filter says *to which rows*.

## CSRF: POST-only RPC, `SameSite=Lax`, Origin check

Three layers, all required because cookies are sent automatically.

1. `RPCHandler` accepts only `POST`, `PUT`, `PATCH`, `DELETE` by default. Do not add `GET` via `allowMethods` — a GET endpoint with cookie auth is CSRF-reachable from a plain `<img>` tag.
2. `SameSite=Lax` blocks the cookie on cross-site POSTs.
3. Check `Origin` on every mutation, before the handler runs.

```ts
// src/server/app.ts
import { env } from "./env/server";

app.use("/rpc/*", async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    const origin = c.req.header("origin");
    if (!origin || !env.ALLOWED_ORIGINS.includes(origin)) {
      return c.json({ error: "forbidden origin" }, 403);
    }
  }
  return next();
});
```

A missing `Origin` on a mutation is a rejection, not a pass. `ALLOWED_ORIGINS` is an explicit list; never reflect the request's own `Origin` back in `Access-Control-Allow-Origin` while `credentials` are allowed.

## Rate limit on Redis, return 429 with `Retry-After`

`rate-limiter-flexible` with `RateLimiterRedis` over the shared ioredis connection. Three limiters, each with its own `keyPrefix` — a shared prefix makes them collide.

| Scope | Points | Duration | Key |
| --- | --- | --- | --- |
| Authenticated | `100` | `60s` | user id |
| Anonymous | `20` | `60s` | client IP |
| Auth endpoints (login, refresh, reset) | `5` | `60s` | client IP |

```ts
// src/server/lib/rate-limit.ts
import { RateLimiterRedis } from "rate-limiter-flexible";
import { redis } from "./redis"; // ioredis, enableOfflineQueue: false

const limiter = (keyPrefix: string, points: number) =>
  new RateLimiterRedis({ storeClient: redis, keyPrefix, points, duration: 60 });

export const authedLimiter = limiter("rl:user", 100);
export const anonLimiter = limiter("rl:ip", 20);
export const authEndpointLimiter = limiter("rl:auth", 5);

export async function consume(l: RateLimiterRedis, key: string) {
  try {
    await l.consume(key);
    return null;
  } catch (rejection) {
    if (rejection instanceof Error) throw rejection; // Redis failure, not a limit hit
    return Math.max(1, Math.round(rejection.msBeforeNext / 1000));
  }
}
```

`consume` rejects with a `RateLimiterRes` (carrying `msBeforeNext`, `remainingPoints`, `consumedPoints`) when the limit is hit, and with an `Error` when Redis itself failed. Distinguishing the two is mandatory: a Redis outage must not read as "every caller is rate limited".

```ts
const retryAfter = await consume(authedLimiter, context.user.id);
if (retryAfter !== null) {
  throw new ORPCError("TOO_MANY_REQUESTS", {
    data: { retryAfter, requestId: context.requestId },
  });
}
```

Set `Retry-After: <seconds>` on the HTTP response alongside the `429`. Set `enableOfflineQueue: false` on the ioredis client so a Redis outage fails fast instead of queueing every request.

## Hash passwords with `Bun.password`

Argon2id is the default algorithm; take the defaults. Hand-tuning `memoryCost` downward is the only way to make this weaker.

```ts
const passwordHash = await Bun.password.hash(plaintext); // argon2id
const ok = await Bun.password.verify(plaintext, user.passwordHash);
```

`Bun.password.verify` reads the algorithm and parameters out of the PHC-format hash string, so no configuration is needed at verify time and the cost can be raised later without a migration.

Never compare hashes with `===`. On a failed login, still run a verify against a dummy hash before responding, so a missing user and a wrong password take the same time.

## Never log these

`redact` in the pino config covers the common paths, but redaction is a safety net, not the rule.

```ts
redact: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.token", "*.secret"];
```

Never logged, at any level: raw tokens (access, refresh, reset, invite), `AUTH_SECRET`, `Cookie` and `Authorization` header values. Also never: password plaintext or hash, session `sid` in a client-visible error, full request bodies on auth routes.

Logged instead: `userId`, `orgId`, `requestId`, `role`, the auth outcome, and the reason as a short code (`expired`, `revoked`, `bad_signature`). A failure reason may go to the log but never to the client — the client gets `UNAUTHORIZED` with nothing else.

## Before you finish

| Detection | Fix |
| --- | --- |
| `createVerifier` without `algorithms` | Pin `algorithms: ["HS256"]`; an empty list accepts an attacker-chosen `alg` |
| JWT carries email, permissions, or org | Claims are `sub`, `sid`, `role`, `exp` only; load the rest server-side |
| Role read from the token claim to authorise | Authorise on the freshly loaded `user.role`; the claim is a hint |
| Token stored in `localStorage` or returned in a body | httpOnly cookie, `Secure`, `SameSite=Lax`, `Path=/` |
| Refresh returns a new access token but the same refresh token | Rotate both and revoke the old `sid` |
| Refresh token accepted twice | Replay: revoke every session for that user |
| No `sessions` row check on the request path | Logout cannot revoke; check `session:{sid}` in L1 then the database |
| Session or user cache TTL over `5m` | `5m` is the revocation lag ceiling |
| Negative session lookup not cached | A revoked session hits the database on every replay |
| `users` write with no `invalidateUser` after commit | Stale role or status survives up to `5m` |
| Cache invalidated before the transaction commits | Re-populates with the pre-commit row; invalidate after commit |
| `allowMethods` adds `GET` to `RPCHandler` | Remove it; POST-only RPC is a CSRF layer |
| `SameSite=Strict` | Breaks OAuth callbacks and email links; use `Lax` |
| No `Origin` check on mutations | Reject when `Origin` is missing or not in `ALLOWED_ORIGINS` |
| `Access-Control-Allow-Origin` reflects the request Origin with credentials | Use the explicit allow-list |
| Rate limiters sharing one `keyPrefix` | One prefix per limiter, or their counters collide |
| Redis error treated as a rate-limit rejection | `rejection instanceof Error` means Redis failed — rethrow, do not 429 |
| `429` without `Retry-After` | Derive seconds from `msBeforeNext` |
| ioredis without `enableOfflineQueue: false` | A Redis outage queues every request instead of failing fast |
| Password hashed with a hand-rolled or non-argon2 routine | `Bun.password.hash` defaults (argon2id) |
| Login skips verify when the user is missing | Verify against a dummy hash so timing does not leak existence |
| Auth failure reason returned to the client | Log the reason; return bare `UNAUTHORIZED` |
| Token, cookie, or secret in a log line | Redaction is a net, not the rule — do not log it |
| Permission middleware without an `orgId` filter in the query | Permission says what; the tenant filter says which rows |
| `console.log` anywhere in the auth path | `logger` |
