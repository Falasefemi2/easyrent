import { Schema } from "effect";
import {
	HttpApi,
	HttpApiEndpoint,
	HttpApiGroup,
	OpenApi,
} from "effect/unstable/httpapi";
import {
	EmailAlreadyTaken,
	InvalidCredentials,
	InvalidToken,
	TokenExpired,
} from "./AuthError";

const AuthTokenSchema = Schema.Struct({
	accessToken: Schema.String,
	refreshToken: Schema.String,
});

export class AuthApiGroup extends HttpApiGroup.make("auth")
	.add(
		HttpApiEndpoint.post("signUp", "/auth/sign-up", {
			payload: Schema.Struct({
				email: Schema.String.pipe(
					Schema.check(
						Schema.isPattern(
							/^\S+@\S+\.\S+$/,
						),
					),
				),
				password: Schema.String.pipe(
					Schema.check(Schema.isMinLength(8)),
				),

				phone: Schema.String.pipe(
					Schema.check(
						Schema.isPattern(
							/^\+?[0-9]\d{7,14}$/,
						),
					),
				),
				fullname: Schema.String.pipe(
					Schema.check(Schema.isMinLength(2)),
					Schema.check(Schema.isMaxLength(100)),
				),
			}),
			success: AuthTokenSchema,
			error: [EmailAlreadyTaken],
		}),
	)
	.add(
		HttpApiEndpoint.post("signIn", "/auth/sign-in", {
			payload: Schema.Struct({
				email: Schema.String.pipe(
					Schema.check(
						Schema.isPattern(
							/^\S+@\S+\.\S+$/,
						),
					),
				),
				password: Schema.String.pipe(
					Schema.check(Schema.isMinLength(8)),
				),
			}),
			success: AuthTokenSchema,
			error: [InvalidCredentials],
		}),
	)
	.add(
		HttpApiEndpoint.post("refresh", "/auth/refresh", {
			payload: Schema.Struct({
				refreshToken: Schema.String,
			}),
			success: AuthTokenSchema,
			error: [InvalidToken, TokenExpired],
		}),
	)
	.add(
		HttpApiEndpoint.post("signOut", "/auth/sign-out", {
			payload: Schema.Struct({
				refreshToken: Schema.String,
			}),
			success: Schema.Void,
		}),
	) {}

export class Api extends HttpApi.make("api")
	.add(AuthApiGroup)
	.annotateMerge(
		OpenApi.annotations({
			title: "Easy Rent API",
		}),
	) {}
