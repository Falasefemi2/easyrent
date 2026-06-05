import { Context, Effect, Layer } from "effect";
import { InvalidToken, TokenExpired } from "./AuthError";
import { AuthConfig } from "./AuthConfig";
import { jwtVerify, SignJWT } from "jose";
import * as crypto from "node:crypto";

export interface AccessTokenPayload {
	sub: string;
	email: string;
}

export class TokenService extends Context.Service<
	TokenService,
	{
		readonly signAccessToken: (
			payload: AccessTokenPayload,
		) => Effect.Effect<string>;
		readonly verifyAccessToken: (
			token: string,
		) => Effect.Effect<AccessTokenPayload, InvalidToken | TokenExpired>;
		readonly generateRefreshToken: () => Effect.Effect<string>;
		readonly hashToken: (token: string) => string;
	}
>()("easyrent/auth/TokenService") {
	static readonly layer = Layer.effect(
		TokenService,
		Effect.gen(function* () {
			const config = yield* AuthConfig;

			const signAccessToken = Effect.fn("TokenService.signAccessToken")(
				(payload: AccessTokenPayload): Effect.Effect<string> =>
					Effect.promise(() =>
						new SignJWT({
							email: payload.email,
						})
							.setProtectedHeader({
								alg: "HS256",
							})
							.setSubject(payload.sub)
							.setIssuedAt()
							.setExpirationTime(`${config.accessTokenTtlSeconds}s`)
							.sign(config.accessTokenSecret),
					),
			);

			const verifyAccessToken = Effect.fn("TokenService.verifyAccessToken")(
				(
					token: string,
				): Effect.Effect<AccessTokenPayload, InvalidToken | TokenExpired> =>
					Effect.tryPromise({
						try: () =>
							jwtVerify(token, config.accessTokenSecret).then((r) => ({
								sub: r.payload.sub as string,
								email: r.payload["email"] as string,
							})),
						catch: (e) => {
							const msg = String(e);
							if (msg.includes("expired")) {
								return new TokenExpired({
									message: "Access token expired",
								});
							}
							return new InvalidToken({
								message: "Invalid access token",
							});
						},
					}),
			);

			const generateRefreshToken = Effect.fn(
				"TokenService.generateRefreshToken",
			)(
				(): Effect.Effect<string> =>
					Effect.sync(() => crypto.randomBytes(64).toString("hex")),
			);

			const hashToken = (token: string): string =>
				crypto.createHash("sha256").update(token).digest("hex");

			return {
				signAccessToken,
				verifyAccessToken,
				generateRefreshToken,
				hashToken,
			};
		}),
	);
}
