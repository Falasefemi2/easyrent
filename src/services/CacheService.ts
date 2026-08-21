import { Context, Effect, Layer } from "effect"
import { RedisService } from "./RedisService"

export const CacheKeys = {
  listings: (
    page: number,
    limit: number,
    filters?: {
      status?: string
      furnished?: boolean
      rooms?: number
      minRooms?: number
      minPrice?: number
      maxPrice?: number
      search?: string
    },
  ) =>
    `listings:page=${page}:limit=${limit}:status=${filters?.status ?? "all"}:furnished=${filters?.furnished ?? "all"}:rooms=${filters?.rooms ?? "all"}:minRooms=${filters?.minRooms ?? "all"}:minPrice=${filters?.minPrice ?? "all"}:maxPrice=${filters?.maxPrice ?? "all"}:search=${filters?.search ?? ""}`,
  listing: (id: string) => `listing:${id}`,

  myListings: (userId: string, page: number, limit: number) => `listings:user=${userId}:page=${page}:limit=${limit}`,
  user: (userId: string) => `user:${userId}`,
} as const

export const CACHE_TTL = {
  listings: 300, // 5 mins
  listing: 600, // 10 minutes
  myListings: 120, // 2 mins ->user's own listings more gynamic
  user: 60, // 60 seconds
}

export class CacheService extends Context.Service<
  CacheService,
  {
    readonly getJson: <T>(key: string) => Effect.Effect<T | null>
    readonly setJson: <T>(key: string, value: T, ttlSeconds: number) => Effect.Effect<void>
    readonly getOrSet: <T, E>(
      key: string,
      ttlSeconds: number,
      compute: () => Effect.Effect<T, E>,
    ) => Effect.Effect<T, E>
    readonly invalidate: (key: string) => Effect.Effect<void>
    readonly invalidateListings: () => Effect.Effect<void>
    readonly invalidateListing: (id: string) => Effect.Effect<void>
  }
>()("easyrent/services/CacheService") {
  static readonly layer = Layer.effect(
    CacheService,
    Effect.gen(function* () {
      const redis = yield* RedisService

      // Add up to 10% jitter to the TTL so hot keys don't all expire
      // simultaneously (avoids a thundering herd on the DB).
      const jitterTtl = (ttlSeconds: number): number =>
        Math.max(1, ttlSeconds + Math.floor(Math.random() * Math.ceil(ttlSeconds * 0.1)))

      const getJson = Effect.fn("CacheService.getJson")(
        <T>(key: string): Effect.Effect<T | null> =>
          Effect.gen(function* () {
            const raw = yield* redis.get(key).pipe(
              Effect.catchTag("RedisError", (e) =>
                Effect.gen(function* () {
                  yield* Effect.logWarning(`Cache GET failed: ${e.message}`)
                  return null
                }),
              ),
            )

            if (!raw) return null

            return yield* Effect.sync(() => {
              try {
                // SAFETY: raw was JSON.stringify'd from the same T by setJson,
                // so parsing it back is expected to match the caller's type.
                return JSON.parse(raw) as T
              } catch {
                return null
              }
            })
          }),
      )

      const setJson = Effect.fn("CacheService.setJson")(
        <T>(key: string, value: T, ttlSeconds: number): Effect.Effect<void> =>
          Effect.gen(function* () {
            const serialized = yield* Effect.sync(() => {
              try {
                return JSON.stringify(value)
              } catch {
                return null
              }
            })

            if (!serialized) return

            yield* redis
              .set(key, serialized, jitterTtl(ttlSeconds))
              .pipe(
                Effect.catchTag("RedisError", (e) =>
                  Effect.logWarning(`Cache SET failed: ${e.message}`).pipe(Effect.asVoid),
                ),
              )
          }),
      )

      const getOrSet = Effect.fn("CacheService.getOrSet")(
        <T, E>(key: string, ttlSeconds: number, compute: () => Effect.Effect<T, E>): Effect.Effect<T, E> =>
          Effect.gen(function* () {
            const cached = yield* getJson<T>(key)
            if (cached !== null) return cached

            // Single-flight: only one caller recomputes on a miss while others
            // wait on the lock, so concurrent requests don't all hit the DB.
            const lockKey = `${key}:lock`
            const lockAcquired = yield* redis
              .setNx(lockKey, "1", 10)
              .pipe(Effect.catchTag("RedisError", () => Effect.succeed(true)))

            if (lockAcquired) {
              try {
                const value = yield* compute()
                yield* setJson(key, value, ttlSeconds)
                return value
              } finally {
                yield* redis.del(lockKey).pipe(Effect.catchTag("RedisError", () => Effect.void))
              }
            }

            // Another caller holds the lock; poll briefly for the fresh value.
            for (let attempt = 0; attempt < 5; attempt++) {
              yield* Effect.sleep(10)
              const fresh = yield* getJson<T>(key)
              if (fresh !== null) return fresh
            }

            return yield* compute()
          }),
      )

      const invalidate = Effect.fn("CacheService.invalidate")(
        (key: string): Effect.Effect<void> => redis.del(key).pipe(Effect.catchTag("RedisError", () => Effect.void)),
      )

      const invalidateListings = Effect.fn("CacheService.invalidateListings")(
        (): Effect.Effect<void> =>
          redis.delPattern("listings:*").pipe(Effect.catchTag("RedisError", () => Effect.void)),
      )

      const invalidateListing = Effect.fn("CacheService.invalidateListing")(
        (id: string): Effect.Effect<void> =>
          Effect.all(
            [
              redis.del(CacheKeys.listing(id)),
              redis.delPattern("listings:*"), // list caches may contain this listing
            ],
            { discard: true },
          ).pipe(Effect.catchTag("RedisError", () => Effect.void)),
      )

      return {
        getJson,
        setJson,
        getOrSet,
        invalidate,
        invalidateListings,
        invalidateListing,
      }
    }),
  )
}
