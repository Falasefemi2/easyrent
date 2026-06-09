import { Context, Effect, Layer } from "effect";
import { RedisService } from "./RedisService";

export const CacheKeys = {
	listings: (
		page: number,
		limit: number,
		filters?: {
			status?: string;
			furnished?: boolean;
			rooms?: number;
			minRooms?: number;
		},
	) =>
		`listings:page=${page}:limit=${limit}:status=${filters?.status ?? "all"}:furnished=${filters?.furnished ?? "all"}:rooms=${filters?.rooms ?? "all"}:minRooms=${filters?.minRooms ?? "all"}`,

	listing: (id: string) => `listing:${id}`,

	myListings: (userId: string, page: number, limit: number) =>
		`listings:user=${userId}:page=${page}:limit=${limit}`,
} as const;

export const CACHE_TTL = {
	listings: 300, // 5 mins
	listing: 600, // 10 minutes
	myListings: 120, // 2 mins ->user's own listings more gynamic
};

export class CacheService extends Context.Service<
	CacheService,
	{
		readonly getJson: <T>(key: string) => Effect.Effect<T | null>;
		readonly setJson: <T>(
			key: string,
			value: T,
			ttlSeconds: number,
		) => Effect.Effect<void>;
		readonly invalidate: (key: string) => Effect.Effect<void>;
		readonly invalidateListings: () => Effect.Effect<void>;
		readonly invalidateListing: (id: string) => Effect.Effect<void>;
	}
>()("easyrent/services/CacheService") {
	static readonly layer = Layer.effect(
		CacheService,
		Effect.gen(function* () {
			const redis = yield* RedisService;

			const getJson = Effect.fn("CacheService.getJson")(
				<T>(key: string): Effect.Effect<T | null> =>
					Effect.gen(function* () {
						const raw = yield* redis.get(key).pipe(
							Effect.catchTag("RedisError", (e) =>
								Effect.gen(function* () {
									yield* Effect.logWarning(`Cache GET failed: ${e.message}`);
									return null;
								}),
							),
						);

						if (!raw) return null;

						return yield* Effect.sync(() => {
							try {
								return JSON.parse(raw) as T;
							} catch {
								return null;
							}
						});
					}),
			);

			const setJson = Effect.fn("CacheService.setJson")(
				<T>(key: string, value: T, ttlSeconds: number): Effect.Effect<void> =>
					Effect.gen(function* () {
						const serialized = yield* Effect.sync(() => {
							try {
								return JSON.stringify(value);
							} catch {
								return null;
							}
						});

						if (!serialized) return;

						yield* redis
							.set(key, serialized, ttlSeconds)
							.pipe(
								Effect.catchTag("RedisError", (e) =>
									Effect.logWarning(`Cache SET failed: ${e.message}`).pipe(
										Effect.asVoid,
									),
								),
							);
					}),
			);

			const invalidate = Effect.fn("CacheService.invalidate")(
				(key: string): Effect.Effect<void> =>
					redis.del(key).pipe(Effect.catchTag("RedisError", () => Effect.void)),
			);

			const invalidateListings = Effect.fn("CacheService.invalidateListings")(
				(): Effect.Effect<void> =>
					redis
						.delPattern("listings:*")
						.pipe(Effect.catchTag("RedisError", () => Effect.void)),
			);

			const invalidateListing = Effect.fn("CacheService.invalidateListing")(
				(id: string): Effect.Effect<void> =>
					Effect.all(
						[
							redis.del(CacheKeys.listing(id)),
							redis.delPattern("listings:*"), // list caches may contain this listing
						],
						{ discard: true },
					).pipe(Effect.catchTag("RedisError", () => Effect.void)),
			);

			return {
				getJson,
				setJson,
				invalidate,
				invalidateListings,
				invalidateListing,
			};
		}),
	);
}
