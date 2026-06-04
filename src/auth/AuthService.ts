import { Context, Effect, Layer, Option } from "effect";
import { AuthRepository } from "./AuthRepository";
import { PasswordService, HashError } from "./PasswordService";
import { TokenService } from "./TokenService";
import { AuthConfig } from "./AuthConfig";
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import {
	EmailAlreadyTaken,
	InvalidCredentials,
	InvalidToken,
	TokenExpired,
} from "./AuthError";

export interface AuthTokens {
	accessToken: string;
	refreshToken: string;
}

type SignUpError = EmailAlreadyTaken | HashError | EffectDrizzleQueryError;
type SignInError = InvalidCredentials | HashError | EffectDrizzleQueryError;
type RefreshError = InvalidToken | TokenExpired | EffectDrizzleQueryError;
type SignOutError = EffectDrizzleQueryError;

export class AuthService extends Context.Service<
	AuthService,
	{
		readonly signUp: (params: {
			email: string;
			password: string;
			phone: string;
			fullname: string;
		}) => Effect.Effect<AuthTokens, SignUpError>;

		readonly signIn: (params: {
			email: string;
			password: string;
		}) => Effect.Effect<AuthTokens, SignInError>;

		readonly refresh: (
			rawRefreshToken: string,
		) => Effect.Effect<AuthTokens, RefreshError>;

		readonly signOut: (
			rawRefreshToken: string,
		) => Effect.Effect<void, SignOutError>;
	}
>()("easyrent/auth/AuthService") {
	static readonly layer = Layer.effect(
		AuthService,
		Effect.gen(function* () {
			const repo = yield* AuthRepository;
			const passwords = yield* PasswordService;
			const tokens = yield* TokenService;
			const config = yield* AuthConfig;

			const issueTokens = Effect.fn(
				"AuthService.issueTokens",
			)((userId: string, email: string) =>
				Effect.gen(function* () {
					const [accessToken, rawRefresh] =
						yield* Effect.all([
							tokens.signAccessToken({
								sub: userId,
								email,
							}),
							tokens.generateRefreshToken(),
						]);

					const tokenHash =
						tokens.hashToken(rawRefresh);
					const expiresAt = new Date(
						Date.now() +
							config.refreshTokenTtlDays *
								24 *
								60 *
								60 *
								1000,
					);

					yield* repo.storeRefreshToken({
						userId,
						tokenHash,
						expiresAt,
					});

					return {
						accessToken,
						refreshToken: rawRefresh,
					};
				}),
			);

			const signUp = Effect.fn("AuthService.signUp")(
				(params: {
					email: string;
					password: string;
					phone: string;
					fullname: string;
				}): Effect.Effect<AuthTokens, SignUpError> =>
					Effect.gen(function* () {
						const existing =
							yield* repo.findByEmail(
								params.email,
							);

						if (Option.isSome(existing)) {
							return yield* new EmailAlreadyTaken(
								{
									message: `${params.email} is already registered`,
								},
							);
						}

						const passwordHash =
							yield* passwords.hash(
								params.password,
							);
						const user =
							yield* repo.createUser({
								email: params.email,
								phone: params.phone,
								passwordHash,
								fullname: params.fullname,
							});

						return yield* issueTokens(
							user.id,
							user.email,
						);
					}),
			);

			const signIn = Effect.fn("AuthService.signIn")(
				(params: {
					email: string;
					password: string;
				}): Effect.Effect<AuthTokens, SignInError> =>
					Effect.gen(function* () {
						const maybeUser =
							yield* repo.findByEmail(
								params.email,
							);

						const user =
							yield* Option.match(
								maybeUser,
								{
									onNone: () =>
										Effect.fail(
											new InvalidCredentials(
												{
													message: "Invalid email or password",
												},
											),
										),
									onSome: Effect.succeed,
								},
							);

						const valid =
							yield* passwords.verify(
								user.passwordHash,
								params.password,
							);

						if (!valid) {
							return yield* new InvalidCredentials(
								{
									message: "Invalid email or password",
								},
							);
						}

						return yield* issueTokens(
							user.id,
							user.email,
						);
					}),
			);

			const refresh = Effect.fn("AuthService.refresh")(
				(
					rawRefreshToken: string,
				): Effect.Effect<AuthTokens, RefreshError> =>
					Effect.gen(function* () {
						const tokenHash =
							tokens.hashToken(
								rawRefreshToken,
							);
						const maybeToken =
							yield* repo.findRefreshToken(
								tokenHash,
							);

						const storedToken =
							yield* Option.match(
								maybeToken,
								{
									onNone: () =>
										Effect.fail(
											new InvalidToken(
												{
													message: "Refresh token not found",
												},
											),
										),
									onSome: Effect.succeed,
								},
							);

						if (
							storedToken.revokedAt !==
							null
						) {
							// Reuse detected — revoke all tokens for this user (theft scenario)
							yield* repo.revokeAllUserTokens(
								storedToken.userId,
							);
							return yield* new InvalidToken(
								{
									message: "Refresh token already used",
								},
							);
						}

						if (
							storedToken.expiresAt <
							new Date()
						) {
							return yield* new TokenExpired(
								{
									message: "Refresh token expired",
								},
							);
						}

						yield* repo.revokeRefreshToken(
							storedToken.id,
						);

						const maybeUser =
							yield* repo.findById(
								storedToken.userId,
							);
						const user =
							yield* Option.match(
								maybeUser,
								{
									onNone: () =>
										Effect.fail(
											new InvalidToken(
												{
													message: "User not found",
												},
											),
										),
									onSome: Effect.succeed,
								},
							);

						return yield* issueTokens(
							user.id,
							user.email,
						);
					}),
			);

			const signOut = Effect.fn("AuthService.signOut")(
				(
					rawRefreshToken: string,
				): Effect.Effect<void, SignOutError> =>
					Effect.gen(function* () {
						const tokenHash =
							tokens.hashToken(
								rawRefreshToken,
							);
						const maybeToken =
							yield* repo.findRefreshToken(
								tokenHash,
							);

						yield* Option.match(
							maybeToken,
							{
								onNone: () =>
									Effect.void,
								onSome: (t) =>
									repo.revokeRefreshToken(
										t.id,
									),
							},
						);
					}),
			);

			return { signUp, signIn, refresh, signOut };
		}),
	);
}
