import { Schema } from "effect";
import {
	HttpApi,
	HttpApiEndpoint,
	HttpApiGroup,
	HttpApiSchema,
	OpenApi,
} from "effect/unstable/httpapi";
import {
	EmailAlreadyTaken,
	EmailNotVerified,
	InvalidCredentials,
	InvalidToken,
	InvalidVerificationToken,
	TokenExpired,
	TokenExpiredError,
} from "./AuthError";
import { UsersApiGroup } from "../users/UsersApi";
import { ListingsApiGroup } from "../listings/ListingsApi";
import { FavoritesApiGroup } from "../favorites/FavoritesApi";
import { RateLimitExceeded } from "../services/RateLimiter";
const AuthTokenSchema = Schema.Struct({
	accessToken: Schema.String,
	refreshToken: Schema.String,
});
export class AuthApiGroup extends HttpApiGroup.make("auth")
	.add(
		HttpApiEndpoint.post("signUp", "/auth/sign-up", {
			payload: Schema.Struct({
				email: Schema.String.pipe(
					Schema.check(Schema.isPattern(/^\S+@\S+\.\S+$/)),
				),
				password: Schema.String.pipe(Schema.check(Schema.isMinLength(8))),
				phone: Schema.String.pipe(
					Schema.check(Schema.isPattern(/^\+?[0-9]\d{7,14}$/)),
				),
				fullname: Schema.String.pipe(
					Schema.check(Schema.isMinLength(2)),
					Schema.check(Schema.isMaxLength(100)),
				),
			}),
			success: AuthTokenSchema,
			error: [EmailAlreadyTaken, RateLimitExceeded],
		}),
	)
	.add(
		HttpApiEndpoint.post("signIn", "/auth/sign-in", {
			payload: Schema.Struct({
				email: Schema.String.pipe(
					Schema.check(Schema.isPattern(/^\S+@\S+\.\S+$/)),
				),
				password: Schema.String.pipe(Schema.check(Schema.isMinLength(8))),
			}),
			success: AuthTokenSchema,
			error: [InvalidCredentials, RateLimitExceeded, EmailNotVerified],
		}),
	)
	.add(
		HttpApiEndpoint.post("refresh", "/auth/refresh", {
			payload: Schema.Struct({
				refreshToken: Schema.String,
			}),
			success: AuthTokenSchema,
			error: [InvalidToken, TokenExpired, RateLimitExceeded],
		}),
	)
	.add(
		HttpApiEndpoint.post("signOut", "/auth/sign-out", {
			payload: Schema.Struct({
				refreshToken: Schema.String,
			}),
			success: Schema.Void,
			error: RateLimitExceeded,
		}),
	)
	.add(
		HttpApiEndpoint.post("verifyEmail", "/auth/verify-email", {
			payload: Schema.Struct({ token: Schema.String }),
			success: Schema.Void,
			error: [InvalidVerificationToken, TokenExpiredError],
		}),
	) {}
export class Api extends HttpApi.make("api")
	.add(AuthApiGroup)
	.add(UsersApiGroup)
	.add(ListingsApiGroup)
	.add(FavoritesApiGroup)
	.annotateMerge(
		OpenApi.annotations({
			title: "Easy Rent API",
		}),
	) {}
