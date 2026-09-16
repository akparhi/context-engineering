<!-- Adapted from wondelai-skills, honra-drizzle-best-practices, aj-geddes-prompts, stack-profile-9b (MIT). See NOTICE.md -->

Three-tier caching for the Bun + Hono + Drizzle stack — exact values only, no approximation.

## Use L1 in-process LRU for session, user, and config

`lru-cache` with `max: 10_000` and `ttl` in milliseconds (≤ 5 minutes). One shared instance per process.

```typescript
// src/lib/cache/l1.ts
import { LRUCache } from "lru-cache";

export const l1 = new LRUCache<string, unknown>({
  max: 10_000,
  ttl: 5 * 60 * 1000, // 5 minutes ceiling; individual sets may pass shorter ttl
});
```

## Use L2 Redis via keyv + @keyv/redis for shared data

`@keyv/redis` wraps ioredis. Use a separate ioredis connection for cache (one for cache, one for BullMQ). Set `keyPrefix` per environment to isolate staging from production.

```typescript
// src/lib/cache/l2.ts
import Keyv from "keyv";
import KeyvRedis from "@keyv/redis";
import { env } from "@/env/server";

const keyvRedis = new KeyvRedis(env.REDIS_URL, {
  namespace: `${env.APP_ENV}:cache`, // isolates staging/prod
});

export const l2 = new Keyv({ store: keyvRedis });
```

## Key format is `v1:{entity}:{id}[:{variant}]`

Every key begins with `v1:` so future format changes can flush cleanly by prefix. Entity is the domain noun, variant is optional sub-scope.

```typescript
// Good
"v1:session:sid_abc"
"v1:user:usr_123"
"v1:config:feature-flags"
"v1:ohlc:isin_XS123:1d"

// Bad — no version prefix, no entity prefix
"usr_123"
"session-abc"
```

## TTL map in seconds — use these names everywhere

```typescript
// src/lib/cache/ttls.ts
export const ttls = {
  xxs: 60,       //  1 min
  xs:  600,      // 10 min
  sm:  3_600,    //  1 h
  md:  21_600,   //  6 h
  lg:  86_400,   //  1 d
  xl:  259_200,  //  3 d
  xxl: 604_800,  //  7 d
} as const satisfies Record<string, number>;
```

## Use `cached()` helper with single-flight promise map

Prevents stampede: concurrent callers for the same key share one in-flight promise. Check L1 first, then L2, then call loader.

```typescript
// src/lib/cache/cached.ts
import { l1 } from "./l1";
import { l2 } from "./l2";

const inflight = new Map<string, Promise<unknown>>();

export async function cached<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const l1hit = l1.get(key) as T | undefined;
  if (l1hit !== undefined) return l1hit;

  const l2hit = await l2.get<T>(key);
  if (l2hit !== undefined) {
    l1.set(key, l2hit, { ttl: Math.min(ttlSeconds, 5 * 60) * 1000 });
    return l2hit;
  }

  if (inflight.has(key)) return inflight.get(key) as Promise<T>;

  const promise = loader().then(async (value) => {
    l1.set(key, value, { ttl: Math.min(ttlSeconds, 5 * 60) * 1000 });
    await l2.set(key, value, ttlSeconds * 1000);
    inflight.delete(key);
    return value;
  });

  inflight.set(key, promise);
  return promise;
}

export function invalidate(key: string): void {
  l1.delete(key);
  void l2.delete(key);
}
```

## Put cache-aside inside `queries.ts` with a `skipCache` option

`queries.ts` is the only file that touches the DB. Cache there, not in the service or router.

```typescript
// modules/users/queries.ts
import { cached, invalidate } from "@/lib/cache/cached";
import { ttls } from "@/lib/cache/ttls";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function getUserById(
  id: string,
  opts?: { skipCache?: boolean },
): Promise<User | undefined> {
  const key = `v1:user:${id}`;
  // stale ≤ 5m; rebuild: invalidateUser(id)
  if (opts?.skipCache) return fetchUser(id);
  return cached(key, ttls.xs, () => fetchUser(id));
}

async function fetchUser(id: string) {
  return db.select().from(users).where(eq(users.id, id)).then((r) => r[0]);
}

export function invalidateUser(id: string): void {
  invalidate(`v1:user:${id}`);
}
```

## Invalidate after commit, never inside the transaction

Call `invalidate()` after `db.transaction()` resolves. Invalidating inside the transaction risks evicting cache before the write is visible to other readers.

```typescript
// service.ts — correct
await db.transaction(async (tx) => {
  await tx.update(users).set({ name }).where(eq(users.id, id));
});
invalidateUser(id); // outside transaction, after it resolves
```

## Keep Drizzle cache opt-in and call `.$withCache()` on chosen queries

With `global: false` (the default) nothing is cached unless you opt in. Call `.$withCache()` only on read-heavy queries where staleness is acceptable. Never set `global: true`.

```typescript
// src/db/index.ts
import { drizzle } from "drizzle-orm/postgres-js";
import { upstashCache } from "drizzle-orm/cache/upstash"; // verify: swap for custom cache adapter

export const db = drizzle(sql, {
  cache: upstashCache({ url: env.UPSTASH_URL, token: env.UPSTASH_TOKEN }), // verify: adapter API
});

// queries.ts — opt in per query
const configs = await db
  .select()
  .from(featureFlags)
  .$withCache(); // cache with default TTL

// Invalidate by table after mutation
await db.$cache.invalidate({ tables: featureFlags }); // verify: API surface in drizzle-orm@rc
```

## Redis client setup — one connection per concern

Use ioredis. One shared connection for `@keyv/redis` (cache), a separate one for BullMQ (`maxRetriesPerRequest: null` required by BullMQ).

```typescript
// src/lib/redis.ts
import Redis from "ioredis";
import { env } from "@/env/server";

// Cache connection — normal reconnect behavior
export const cacheRedis = new Redis(env.REDIS_URL, {
  keyPrefix: `${env.APP_ENV}:`,
  lazyConnect: true,
});

// Jobs connection — BullMQ requirement
export const jobsRedis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // required for BullMQ blocking commands
  lazyConnect: true,
});
```

## Declare staleness on every cached query

Every cached query gets a one-line comment declaring max staleness and the invalidation function.

```typescript
// stale ≤ 5m; rebuild: invalidateUser(id)
// stale ≤ 10m; rebuild: all on feature-flags write
// stale ≤ 1h; rebuild: manual cache clear
```

## Track hit/miss metrics per tier

Increment counters so dashboards show cache effectiveness. Labels: `tier` (`l1` | `l2`), `hit` (boolean).

```typescript
// src/lib/cache/metrics.ts
let hits = { l1: 0, l2: 0 };
let misses = { l1: 0, l2: 0 };

export function recordHit(tier: "l1" | "l2"): void  { hits[tier]++; }
export function recordMiss(tier: "l1" | "l2"): void { misses[tier]++; }
export function getCacheMetrics() { return { hits, misses }; }
```

## Never cache these

- Auth decisions with TTL > 5 minutes.
- Money balances or any value under a `FOR UPDATE` lock.
- Anything read inside a transaction that expects current committed data.

## Before you finish

| Check | Rule |
| --- | --- |
| Key starts with `v1:` | Yes — all keys use `v1:{entity}:{id}` format |
| L1 TTL ≤ 5 minutes | Enforced by `Math.min(ttlSeconds, 5 * 60)` in helper |
| L1 `max: 10_000` set | `new LRUCache({ max: 10_000, ... })` |
| Single-flight for stampede | `inflight` map in `cached()` |
| Invalidation after commit | `invalidate()` called outside `db.transaction()` |
| Cache opt-in | Default `global: false`; never `global: true` |
| Separate ioredis connections | `cacheRedis` and `jobsRedis` are distinct instances |
| `maxRetriesPerRequest: null` on jobs connection | Required by BullMQ blocking commands |
| Staleness comment on each query | `// stale ≤ Xm; rebuild: fn()` |
| Auth decisions exempt | TTL > 5m and money balances are never cached |
