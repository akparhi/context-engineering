<!-- Adapted from wondelai-skills, honra-drizzle-best-practices, aj-geddes-prompts, stack-profile-9b (MIT). See NOTICE.md -->

Three-tier caching for the Bun + Hono + Drizzle stack — exact values only, no approximation.

## Use L1 in-process LRU for session, user, and config

`lru-cache` with `max: 10_000` and `ttl` in milliseconds (≤ 5 minutes). One shared instance per process.

```typescript
// src/server/lib/cache/l1.ts
import { LRUCache } from "lru-cache";

export const l1 = new LRUCache<string, unknown>({
  max: 10_000,
  ttl: 5 * 60 * 1000, // 5 minutes ceiling; individual sets may pass shorter ttl
});
```

## Use L2 Redis via `@keyv/redis`, which runs on `@redis/client`

`@keyv/redis` is built on `@redis/client`, not ioredis. It owns its own connection. Set `namespace` per environment to isolate staging from production.

```typescript
// src/server/lib/cache/l2.ts
import Keyv from "keyv";
import KeyvRedis from "@keyv/redis";
import { env } from "@/server/env/server";

export const keyvRedis = new KeyvRedis(env.REDIS_URL, {
  namespace: `${env.APP_ENV}:cache`, // isolates staging/prod
});

export const l2 = new Keyv({ store: keyvRedis });

// Shutdown closes this connection; `force` skips the QUIT round-trip
export const closeL2 = () => keyvRedis.disconnect();
```

BullMQ keeps a separate ioredis connection with `maxRetriesPerRequest: null`. The two clients never share a handle.

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
// src/server/lib/cache/ttls.ts
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
// src/server/lib/cache/cached.ts
import { l1 } from "./l1";
import { l2 } from "./l2";
import { logger } from "@/server/lib/logger";

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

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = (async () => {
    const value = await loader();
    l1.set(key, value, { ttl: Math.min(ttlSeconds, 5 * 60) * 1000 });
    await l2.set(key, value, ttlSeconds * 1000);
    return value;
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key); // also on rejection, or the failed promise is served forever
  }
}

export function invalidate(key: string): void {
  l1.delete(key);
  l2.delete(key).catch((err) => logger.error({ err, key }, "l2 invalidation failed"));
}
```

## Put cache-aside inside `queries.ts` with a `skipCache` option

`queries.ts` is the only file that touches the DB. Cache there, not in the service or router.

```typescript
// modules/org-settings/queries.ts
import { cached, invalidate } from "@/server/lib/cache/cached";
import { ttls } from "@/server/lib/cache/ttls";
import { db } from "@/server/db";

export async function getOrgSettings(
  orgId: string,
  opts?: { skipCache?: boolean },
): Promise<OrgSettings | undefined> {
  // stale ≤ 10m; rebuild: invalidateOrgSettings(orgId)
  if (opts?.skipCache) return fetchOrgSettings(orgId);
  return cached(`v1:org-settings:${orgId}`, ttls.xs, () => fetchOrgSettings(orgId));
}

async function fetchOrgSettings(orgId: string) {
  return db.query.orgSettings.findFirst({
    where: { orgId: { eq: orgId }, deletedAt: { isNull: true } },
  });
}

export function invalidateOrgSettings(orgId: string): void {
  invalidate(`v1:org-settings:${orgId}`);
}
```

## Invalidate after commit, never inside the transaction

`await invalidate()` after `db.transaction()` resolves. Invalidating inside the transaction evicts the key while the write is still invisible to other readers, so a concurrent read refills the cache with pre-write data.

```typescript
// modules/org-settings/service.ts
import { db } from "@/server/db";
import { orgSettings } from "./table";
import { invalidateOrgSettings } from "./queries";
import { eq } from "drizzle-orm";

export async function updateOrgSettings(
  orgId: string,
  patch: OrgSettingsPatch,
): Promise<OrgSettings> {
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(orgSettings)
      .set(patch)
      .where(eq(orgSettings.orgId, orgId))
      .returning();
    return row;
  });

  invalidateOrgSettings(orgId); // after commit, never inside it
  return updated;
}
```

## Keep Drizzle cache opt-in and call `.$withCache()` on chosen queries

With `global: false` (the default) nothing is cached unless you opt in. Call `.$withCache()` only on read-heavy queries where staleness is acceptable. Never set `global: true`.

```typescript
// src/server/db/index.ts
import { drizzle } from "drizzle-orm/postgres-js";
import { upstashCache } from "drizzle-orm/cache/upstash";

export const db = drizzle(sql, {
  cache: upstashCache({ url: env.UPSTASH_URL, token: env.UPSTASH_TOKEN }),
});

// queries.ts — opt in per query
const configs = await db
  .select()
  .from(featureFlags)
  .$withCache({ config: { ex: ttls.sm } });

// Invalidate by table after the write transaction commits
await db.$cache.invalidate({ tables: featureFlags });
```

## Give cache and jobs separate Redis clients

Two clients, two libraries. `@keyv/redis` creates its own `@redis/client` connection from the URL. BullMQ needs ioredis with `maxRetriesPerRequest: null` for its blocking commands.

```typescript
// src/server/lib/redis.ts
import Redis from "ioredis";
import { env } from "@/server/env/server";

// Jobs connection — BullMQ requirement. The cache connection lives in cache/l2.ts.
export const jobsRedis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // required for BullMQ blocking commands
  lazyConnect: true,
});
```

Shutdown closes both: `await closeL2()` from `cache/l2.ts` and `await jobsRedis.quit()`.

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
// src/server/lib/cache/metrics.ts
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
| Single-flight for stampede | `inflight` map in `cached()`, deleted in `finally` |
| Invalidation after commit | `invalidate()` called outside `db.transaction()` |
| L2 delete failure logged | `.catch()` on `l2.delete` calls `logger.error` |
| Cache opt-in | Default `global: false`; never `global: true` |
| Cache and jobs use separate clients | `@keyv/redis` on `@redis/client`; BullMQ on ioredis |
| `maxRetriesPerRequest: null` on jobs connection | Required by BullMQ blocking commands |
| Staleness comment on each query | `// stale ≤ Xm; rebuild: fn()` |
| Auth decisions exempt | TTL > 5m and money balances are never cached |
