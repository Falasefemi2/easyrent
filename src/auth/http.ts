import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Api } from "./Api";
import { Effect, Layer } from "effect";
import { AuthService } from "./AuthService";
import { AuthRepository } from "./AuthRepository";
import { PasswordService } from "./PasswordService";
import { TokenService } from "./TokenService";
import { AuthConfig } from "./AuthConfig";
import { DatabaseLive } from "../db";

export const AuthApiHandlers = HttpApiBuilder.group(
	Api,
	"auth",
	Effect.fn(function* (handlers) {
		const auth = yield* AuthService;
		return handlers
			.handle("signUp", ({ payload }) =>
				auth.signUp(payload).pipe(Effect.orDie),
			)
			.handle("signIn", ({ payload }) =>
				auth.signIn(payload).pipe(Effect.orDie),
			)
			.handle("refresh", ({ payload }) =>
				auth.refresh(payload.refreshToken).pipe(Effect.orDie),
			)
			.handle("signOut", ({ payload }) =>
				auth.signOut(payload.refreshToken).pipe(Effect.orDie),
			);
	}),
).pipe(
	Layer.provide(AuthService.layer),
	Layer.provide(AuthRepository.layer),
	Layer.provide(PasswordService.layer),
	Layer.provide(TokenService.layer),
	Layer.provide(AuthConfig.layer),
	Layer.provide(DatabaseLive),
);
