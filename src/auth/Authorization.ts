import { Context, Effect, Layer, Redacted, Schema } from "effect";
import { HttpApiMiddleware, HttpApiSecurity } from "effect/unstable/httpapi";
import { AuthConfig } from "./AuthConfig";
import { AuthRepository } from "./AuthRepository";
import { TokenService } from "./TokenService";

export class CurrentUser extends Context.Service<
	CurrentUser,
	{
		readonly userId: string;
		readonly email: string;
	}
>()("easyrent/auth/Authorization/CurrentUser") {}

export class Unauthorized extends Schema.TaggedErrorClass<Unauthorized>()(
	"Unauthorized",
	{
		message: Schema.String,
	},
	{ httpApiStatus: 401 },
) {}

export class Authorization extends HttpApiMiddleware.Service<
	Authorization,
	{
		provides: CurrentUser;
		requires: never;
	}
>()("easyrent/auth/Authorization", {
	requiredForClient: true,
	security: {
		bearer: HttpApiSecurity.bearer,
	},
	error: Unauthorized,
}) {}

export const AuthorizationLayer = Layer.effect(
	Authorization,
	Effect.gen(function* () {
		const tokens = yield* TokenService;
		const repo = yield* AuthRepository;

		return Authorization.of({
			bearer: Effect.fn("Authorization.bearer")(function* (
				httpEffect,
				{ credential },
			) {
				const token = Redacted.value(credential);

				const payload = yield* tokens.verifyAccessToken(token).pipe(
					Effect.mapError(
						(e) =>
							new Unauthorized({
								message: e.message,
							}),
					),
				);

				const maybeUser = yield* repo.findById(payload.sub).pipe(
					Effect.mapError(
						() =>
							new Unauthorized({
								message: "User lookup failed",
							}),
					),
				);

				if (maybeUser._tag === "None") {
					return yield* new Unauthorized({
						message: "User not found",
					});
				}

				return yield* Effect.provideService(httpEffect, CurrentUser, {
					userId: maybeUser.value.id,
					email: maybeUser.value.email,
				});
			}),
		});
	}),
).pipe(
	Layer.provide([TokenService.layer, AuthRepository.layer, AuthConfig.layer]),
);
