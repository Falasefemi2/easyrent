import { describe, expect, it, vi } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { HttpServerRequest } from "effect/unstable/http";
import { LoggerService } from "../src/services/LoggerService";
import { RateLimiter } from "../src/services/RateLimiter";
import { RedisService } from "../src/services/RedisService";

const makeTestRedis = (storage: Map<string, { value: number; ttl: number }>) =>
	Layer.succeed(
		RedisService,
		RedisService.of({
			get: (key) => Effect.succeed(storage.get(key)?.value.toString() ?? null),
			set: (key, value, ttlSeconds) =>
				Effect.sync(() => {
					storage.set(key, { value: parseInt(value, 10), ttl: ttlSeconds });
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

const mockLogger = Layer.succeed(
	LoggerService,
	LoggerService.of({
		info: vi.fn(() => Effect.void),
		warn: vi.fn(() => Effect.void),
		error: vi.fn(() => Effect.void),
		debug: vi.fn(() => Effect.void),
		logRequest: vi.fn(() => Effect.void),
		logAuthEvent: vi.fn(() => Effect.void),
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
			Effect.provide(mockLogger),
		);
	});

	it.effect(
		"fails when limit is exceeded and provides accurate retryAfter",
		() => {
			const storage = new Map<string, { value: number; ttl: number }>();
			return Effect.gen(function* () {
				const limiter = yield* RateLimiter;
				const logger = yield* LoggerService;

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

				expect(logger.warn).toHaveBeenCalledWith("Rate limit exceeded", {
					key: "test",
					limit: 2,
					count: 3,
					windowSeconds: 60,
				});
			}).pipe(
				Effect.provide(RateLimiter.layer),
				Effect.provide(makeTestRedis(storage)),
				Effect.provide(mockLogger),
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
			Effect.provide(mockLogger),
		);
	});
});
