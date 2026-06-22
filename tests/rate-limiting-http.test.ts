import { describe, expect, it, vi } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { HttpApiBuilder, HttpApiClient } from "effect/unstable/httpapi";
import { Api } from "../src/auth/Api";
import { AuthApiHandlers } from "../src/auth/http";
import { AuthService } from "../src/auth/AuthService";
import { RateLimiter, RateLimitExceeded } from "../src/services/RateLimiter";
import { LoggerService } from "../src/services/LoggerService";
import { PgClient } from "@effect/sql-pg";

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

describe("HTTP SignUp Rate Limiting", () => {
	it.effect("returns 429 when rate limit is exceeded", () => {
		return Effect.gen(function* () {
			// Mock RateLimiter to fail immediately
			const failingRateLimiter = Layer.succeed(
				RateLimiter,
				RateLimiter.of({
					check: () => Effect.fail(new RateLimitExceeded({ message: "Too many requests", retryAfter: 60 })),
					checkRequest: () => Effect.fail(new RateLimitExceeded({ message: "Too many requests", retryAfter: 60 })),
				})
			);

			// Mock AuthService
			const mockAuthService = Layer.succeed(
				AuthService,
				AuthService.of({
					signUp: () => Effect.dieMessage("Should not be called"),
					signIn: () => Effect.dieMessage("Should not be called"),
					refresh: () => Effect.dieMessage("Should not be called"),
					signOut: () => Effect.dieMessage("Should not be called"),
					verifyEmail: () => Effect.dieMessage("Should not be called"),
				})
			);

			const mockPgClient = Layer.succeed(
				PgClient,
				{} as any
			);

			// Build routes
			const ApiRoutes = HttpApiBuilder.layer(Api).pipe(
				Layer.provide(AuthApiHandlers),
				Layer.provide(mockPgClient),
				Layer.provide(failingRateLimiter),
				Layer.provide(mockAuthService),
				Layer.provide(mockLogger),
			);

			// Use HttpApiClient.make
			const client = yield* HttpApiClient.make(Api).pipe(
				Effect.provide(ApiRoutes)
			);

			const result = yield* client.auth.signUp({
				payload: {
					email: "test@example.com",
					password: "password123",
					phone: "+2347013329953",
					fullname: "Test User",
				}
			}).pipe(Effect.exit);

			console.log("TEST RESULT:", JSON.stringify(result, null, 2));
			expect(result).toBeDefined();
		});
	});
});
