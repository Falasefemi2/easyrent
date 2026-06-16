import { Effect, Layer, Context } from "effect";
import { RateLimiter, RateLimitExceeded } from "../src/services/RateLimiter";
import { RedisService, RedisError } from "../src/services/RedisService";
import { HttpServerRequest } from "effect/unstable/http";
import { describe, it, expect } from "@effect/vitest";

const makeTestRedis = (storage: Map<string, { value: number; ttl: number }>) =>
	Layer.succeed(
		RedisService,
		RedisService.of({
			get: (key) => Effect.succeed(storage.get(key)?.value.toString() ?? null),
			set: (key, value, ttlSeconds) =>
				Effect.sync(() => {
					storage.set(key, { value: parseInt(value), ttl: ttlSeconds });
				}),
			del: (...keys) =>
				Effect.sync(() => {
					for (const key of keys) storage.delete(key);
				}),
			delPattern: (pattern) =>
				Effect.sync(() => {
					const regex = new RegExp(pattern.replace("*", ".*"));
					for (const key of storage.keys()) {
						if (regex.test(key)) storage.delete(key);
					}
				}),
			incr: (key) =>
				Effect.sync(() => {
					const entry = storage.get(key) ?? { value: 0, ttl: -1 };
					const newValue = entry.value + 1;
					storage.set(key, { ...entry, value: newValue });
					return newValue;
				}),
			expire: (key, seconds) =>
				Effect.sync(() => {
					const entry = storage.get(key);
					if (entry) {
						storage.set(key, { ...entry, ttl: seconds });
					}
				}),
			ttl: (key) =>
				Effect.sync(() => {
					return storage.get(key)?.ttl ?? -1;
				}),
		}),
	);

describe("RateLimiter", () => {
	it.effect("allows requests under the limit", () => {
		const storage = new Map<string, { value: number; ttl: number }>();
		return Effect.gen(function* () {
			const limiter = yield* RateLimiter;

			yield* limiter.check({ key: "test", limit: 2, windowSeconds: 60 });
			yield* limiter.check({ key: "test", limit: 2, windowSeconds: 60 });

			expect(storage.get("test")?.value).toBe(2);
		}).pipe(
			Effect.provide(RateLimiter.layer),
			Effect.provide(makeTestRedis(storage)),
		);
	});

	it.effect(
		"fails when limit is exceeded and provides accurate retryAfter",
		() => {
			const storage = new Map<string, { value: number; ttl: number }>();
			return Effect.gen(function* () {
				const limiter = yield* RateLimiter;

				yield* limiter.check({ key: "test", limit: 2, windowSeconds: 60 });
				yield* limiter.check({ key: "test", limit: 2, windowSeconds: 60 });

				// Manually decrease TTL to simulate time passing
				const entry = storage.get("test")!;
				storage.set("test", { ...entry, ttl: 30 });

				const result = yield* limiter
					.check({ key: "test", limit: 2, windowSeconds: 60 })
					.pipe(Effect.flip);

				expect(result._tag).toBe("RateLimitExceeded");
				expect(result.retryAfter).toBe(30);
				expect(result.message).toContain("30 seconds");
			}).pipe(
				Effect.provide(RateLimiter.layer),
				Effect.provide(makeTestRedis(storage)),
			);
		},
	);

	it.effect("checkRequest uses IP from headers", () => {
		const storage = new Map<string, { value: number; ttl: number }>();
		return Effect.gen(function* () {
			const limiter = yield* RateLimiter;

			const mockRequest = {
				headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
				remoteAddress: "127.0.0.1",
			};

			yield* limiter
				.checkRequest({ prefix: "test", limit: 1, windowSeconds: 60 })
				.pipe(
					Effect.provideService(
						HttpServerRequest.HttpServerRequest,
						mockRequest as any,
					),
				);

			expect(storage.has("ratelimit:test:1.2.3.4")).toBe(true);
		}).pipe(
			Effect.provide(RateLimiter.layer),
			Effect.provide(makeTestRedis(storage)),
		);
	});
});
