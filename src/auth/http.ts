import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { DatabaseLive } from "../db";
import { RateLimiter } from "../services/RateLimiter";
import { RedisService } from "../services/RedisService.ts";
import { Api } from "./Api";
import { AuthConfig } from "./AuthConfig";
import { AuthRepository } from "./AuthRepository";
import { AuthService } from "./AuthService";
import { PasswordService } from "./PasswordService";
import { TokenService } from "./TokenService";

export const AuthApiHandlers = HttpApiBuilder.group(
	Api,
	"auth",
	Effect.fn(function* (handlers) {
		const auth = yield* AuthService;
		const rateLimiters = yield* RateLimiter;
		return handlers
			.handle("signUp", ({ payload }) =>
				Effect.gen(function* () {
					yield* rateLimiters.checkRequest({
						prefix: "sign-up",
						limit: 10,
						windowSeconds: 3600,
					});
					return yield* auth
						.signUp(payload)
						.pipe(
							Effect.catchTag("HashError", Effect.orDie),
							Effect.catchTag("EffectDrizzleQueryError", Effect.orDie),
						);
				}),
			)
			.handle("signIn", ({ payload }) =>
				Effect.gen(function* () {
					yield* rateLimiters.checkRequest({
						prefix: "sign-in",
						limit: 10,
						windowSeconds: 900,
					});
					return yield* auth
						.signIn(payload)
						.pipe(
							Effect.catchTag("HashError", Effect.orDie),
							Effect.catchTag("EffectDrizzleQueryError", Effect.orDie),
						);
				}),
			)
			.handle("refresh", ({ payload }) =>
				Effect.gen(function* () {
					yield* rateLimiters.checkRequest({
						prefix: "refresh",
						limit: 30,
						windowSeconds: 3600,
					});
					return yield* auth
						.refresh(payload.refreshToken)
						.pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.orDie));
				}),
			)
			.handle("verifyEmail", ({ payload }) => auth.verifyEmail(payload.token))
			.handle("signOut", ({ payload }) =>
				auth
					.signOut(payload.refreshToken)
					.pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.orDie)),
			);
	}),
).pipe(
	Layer.provide(AuthService.layer),
	Layer.provide(RateLimiter.layer),
	Layer.provide(RedisService.layer),
	Layer.provide(AuthRepository.layer),
	Layer.provide(PasswordService.layer),
	Layer.provide(TokenService.layer),
	Layer.provide(AuthConfig.layer),
	Layer.provide(DatabaseLive),
);
