import { Effect, Layer, Option, Cause, Exit } from "effect";
import { AuthConfig } from "../src/auth/AuthConfig";
import { PasswordService } from "../src/auth/PasswordService";
import {
	AuthRepository,
	type RefreshTokenRow,
	type UserRow,
} from "../src/auth/AuthRepository";
import { AuthService } from "../src/auth/AuthService";
import { TokenService } from "../src/auth/TokenService";
import { EmailService } from "../src/services/EmailService";
import { LoggerService } from "../src/services/LoggerService";
import { describe, it, expect, vi } from "@effect/vitest";

const TestAuthConfig = Layer.succeed(AuthConfig, {
	accessTokenSecret: new TextEncoder().encode(
		"test-access-secret-32-bytes-long!!",
	),
	refreshTokenSecret: new TextEncoder().encode(
		"test-refresh-secret-32-bytes-long!",
	),
	accessTokenTtlSeconds: 900,
	refreshTokenTtlDays: 30,
	port: 3000,
	databaseUrl: "postgres://test",
});

const TestPasswordService = Layer.succeed(PasswordService, {
	hash: (password) => Effect.succeed(`hashed:${password}`),
	verify: (hash, password) => Effect.succeed(hash === `hashed:${password}`),
});

const makeTestAuthRepository = Layer.succeed(
	AuthRepository,
	(() => {
		const users = new Map<string, UserRow>();
		const usersByEmail = new Map<string, UserRow>();
		const refreshTokens = new Map<string, RefreshTokenRow>();

		return {
			findByEmail: (email) =>
				Effect.succeed(Option.fromNullOr(usersByEmail.get(email) ?? null)),

			findById: (id) =>
				Effect.succeed(Option.fromNullOr(users.get(id) ?? null)),

			createUser: (params) =>
				Effect.sync(() => {
					const user: UserRow = {
						id: crypto.randomUUID(),
						email: params.email,
						phone: params.phone,
						passwordHash: params.passwordHash,
						fullname: params.fullname,
						avatarUrl: null,
						emailVerified: true, // Default to true for tests to avoid verification flow
					};
					users.set(user.id, user);
					usersByEmail.set(user.email, user);
					return user;
				}),

			storeRefreshToken: ({ userId, tokenHash, expiresAt }) =>
				Effect.sync(() => {
					refreshTokens.set(tokenHash, {
						id: crypto.randomUUID(),
						userId,
						expiresAt,
						revokedAt: null,
					});
				}),

			findRefreshToken: (tokenHash) =>
				Effect.succeed(Option.fromNullOr(refreshTokens.get(tokenHash) ?? null)),

			revokeRefreshToken: (id) =>
				Effect.sync(() => {
					for (const [key, token] of refreshTokens.entries()) {
						if (token.id === id) {
							refreshTokens.set(key, { ...token, revokedAt: new Date() });
						}
					}
				}),

			revokeAllUserTokens: (userId) =>
				Effect.sync(() => {
					for (const [key, token] of refreshTokens.entries()) {
						if (token.userId === userId && !token.revokedAt) {
							refreshTokens.set(key, { ...token, revokedAt: new Date() });
						}
					}
				}),

			storeVerificationToken: () => Effect.void,
			findByVerificationToken: () => Effect.succeed(Option.none()),
			markEmailVerified: () => Effect.void,
		};
	})(),
);

const TestEmailService = Layer.succeed(EmailService, {
	sendVerificationEmail: vi.fn(() => Effect.void),
	sendPasswordResetEmail: vi.fn(() => Effect.void),
	sendWelcomeEmail: vi.fn(() => Effect.void),
});

const TestLoggerService = Layer.succeed(LoggerService, {
	info: vi.fn(() => Effect.void),
	warn: vi.fn(() => Effect.void),
	error: vi.fn(() => Effect.void),
	debug: vi.fn(() => Effect.void),
	logRequest: vi.fn(() => Effect.void),
	logAuthEvent: vi.fn(() => Effect.void),
});

const testLayer = AuthService.layer.pipe(
	Layer.provideMerge(makeTestAuthRepository),
	Layer.provideMerge(TestPasswordService),
	Layer.provideMerge(TokenService.layer),
	Layer.provideMerge(TestAuthConfig),
	Layer.provideMerge(TestEmailService),
	Layer.provideMerge(TestLoggerService),
);

describe("AuthService", () => {
	describe("signUp", () => {
		it.effect("creates user and returns tokens", () =>
			Effect.gen(function* () {
				const auth = yield* AuthService;

				const result = yield* auth.signUp({
					email: "femi@example.com",
					password: "password123",
					phone: "+2347013329953",
					fullname: "Femi Falase",
				});

				expect(result.accessToken).toBeDefined();
				expect(result.refreshToken).toBeDefined();
				expect(typeof result.accessToken).toBe("string");
				expect(typeof result.refreshToken).toBe("string");
			}).pipe(Effect.provide(testLayer)),
		);

		it.effect("fails with EmailAlreadyTaken on duplicate email", () =>
			Effect.gen(function* () {
				const auth = yield* AuthService;
				const params = {
					email: "duplicate@example.com",
					password: "password123",
					phone: "+2347013329953",
					fullname: "Femi Falase",
				};

				yield* auth.signUp(params);

				const result = yield* auth.signUp(params).pipe(Effect.exit);

				expect(Exit.isFailure(result)).toBe(true);
				if (Exit.isFailure(result)) {
					const error = Cause.findErrorOption(result.cause);
					expect(Option.isSome(error)).toBe(true);
					if (Option.isSome(error)) {
						expect((error.value as any)._tag).toBe("EmailAlreadyTaken");
					}
				}
			}).pipe(Effect.provide(testLayer)),
		);
	});

	describe("signIn", () => {
		it.effect("returns tokens for valid credentials", () =>
			Effect.gen(function* () {
				const auth = yield* AuthService;

				yield* auth.signUp({
					email: "signin@example.com",
					password: "mypassword",
					phone: "+2347013329953",
					fullname: "Test User",
				});

				const result = yield* auth.signIn({
					email: "signin@example.com",
					password: "mypassword",
				});

				expect(result.accessToken).toBeDefined();
				expect(result.refreshToken).toBeDefined();
			}).pipe(Effect.provide(testLayer)),
		);

		it.effect("fails with InvalidCredentials for wrong password", () =>
			Effect.gen(function* () {
				const auth = yield* AuthService;

				yield* auth.signUp({
					email: "wrongpass@example.com",
					password: "correctpassword",
					phone: "+2347013329953",
					fullname: "Test User",
				});

				const result = yield* auth
					.signIn({
						email: "wrongpass@example.com",
						password: "wrongpassword",
					})
					.pipe(Effect.exit);

				expect(Exit.isFailure(result)).toBe(true);
				if (Exit.isFailure(result)) {
					const error = Cause.findErrorOption(result.cause);
					expect(Option.isSome(error)).toBe(true);
					if (Option.isSome(error)) {
						expect((error.value as any)._tag).toBe("InvalidCredentials");
					}
				}
			}).pipe(Effect.provide(testLayer)),
		);

		it.effect("fails with InvalidCredentials for unknown email", () =>
			Effect.gen(function* () {
				const auth = yield* AuthService;

				const result = yield* auth
					.signIn({
						email: "nobody@example.com",
						password: "password",
					})
					.pipe(Effect.exit);

				expect(Exit.isFailure(result)).toBe(true);
				if (Exit.isFailure(result)) {
					const error = Cause.findErrorOption(result.cause);
					expect(Option.isSome(error)).toBe(true);
					if (Option.isSome(error)) {
						expect((error.value as any)._tag).toBe("InvalidCredentials");
					}
				}
			}).pipe(Effect.provide(testLayer)),
		);
	});

	describe("refresh", () => {
		it.effect("issues new tokens on valid refresh token", () =>
			Effect.gen(function* () {
				const auth = yield* AuthService;

				const { refreshToken } = yield* auth.signUp({
					email: "refresh@example.com",
					password: "password123",
					phone: "+2347013329953",
					fullname: "Test User",
				});

				const result = yield* auth.refresh(refreshToken);

				expect(result.accessToken).toBeDefined();
				expect(result.refreshToken).toBeDefined();
				expect(result.refreshToken).not.toBe(refreshToken);
			}).pipe(Effect.provide(testLayer)),
		);

		it.effect("fails on reused refresh token — rotation attack", () =>
			Effect.gen(function* () {
				const auth = yield* AuthService;

				const { refreshToken } = yield* auth.signUp({
					email: "rotation@example.com",
					password: "password123",
					phone: "+2347013329953",
					fullname: "Test User",
				});

				yield* auth.refresh(refreshToken);

				const result = yield* auth.refresh(refreshToken).pipe(Effect.exit);

				expect(Exit.isFailure(result)).toBe(true);
				if (Exit.isFailure(result)) {
					const error = Cause.findErrorOption(result.cause);
					expect(Option.isSome(error)).toBe(true);
					if (Option.isSome(error)) {
						expect((error.value as any)._tag).toBe("InvalidToken");
					}
				}
			}).pipe(Effect.provide(testLayer)),
		);
	});

	describe("signOut", () => {
		it.effect("revokes refresh token", () =>
			Effect.gen(function* () {
				const auth = yield* AuthService;

				const { refreshToken } = yield* auth.signUp({
					email: "signout@example.com",
					password: "password123",
					phone: "+2347013329953",
					fullname: "Test User",
				});

				yield* auth.signOut(refreshToken);

				const result = yield* auth.refresh(refreshToken).pipe(Effect.exit);

				expect(Exit.isFailure(result)).toBe(true);
				if (Exit.isFailure(result)) {
					const error = Cause.findErrorOption(result.cause);
					expect(Option.isSome(error)).toBe(true);
					if (Option.isSome(error)) {
						expect((error.value as any)._tag).toBe("InvalidToken");
					}
				}
			}).pipe(Effect.provide(testLayer)),
		);
	});
});
