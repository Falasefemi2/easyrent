import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import { Context, Effect, Layer, Option } from "effect";
import { EmailService } from "../services/EmailService";
import { LoggerService } from "../services/LoggerService";
import { AuthConfig } from "./AuthConfig";
import {
	EmailAlreadyTaken,
	EmailNotVerified,
	InvalidCredentials,
	InvalidToken,
	InvalidVerificationToken,
	TokenExpired,
	TokenExpiredError,
} from "./AuthError";
import { AuthRepository } from "./AuthRepository";
import { type HashError, PasswordService } from "./PasswordService";
import { TokenService } from "./TokenService";

export interface AuthTokens {
	accessToken: string;
	refreshToken: string;
}

type SignUpError = EmailAlreadyTaken | HashError | EffectDrizzleQueryError;
type SignInError =
	| InvalidCredentials
	| HashError
	| EffectDrizzleQueryError
	| EmailNotVerified;
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
		readonly verifyEmail: (
			token: string,
		) => Effect.Effect<void, InvalidVerificationToken | TokenExpiredError>;
	}
>()("easyrent/auth/AuthService") {
	static readonly layer = Layer.effect(
		AuthService,
		Effect.gen(function* () {
			const repo = yield* AuthRepository;
			const passwords = yield* PasswordService;
			const tokens = yield* TokenService;
			const config = yield* AuthConfig;
			const email = yield* EmailService;
			const logger = yield* LoggerService;

			const issueTokens = Effect.fn("AuthService.issueTokens")(
				(userId: string, email: string) =>
					Effect.gen(function* () {
						const [accessToken, rawRefresh] = yield* Effect.all([
							tokens.signAccessToken({
								sub: userId,
								email,
							}),
							tokens.generateRefreshToken(),
						]);

						const tokenHash = tokens.hashToken(rawRefresh);
						const expiresAt = new Date(
							Date.now() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
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
						const existing = yield* repo.findByEmail(params.email);

						if (Option.isSome(existing)) {
							return yield* new EmailAlreadyTaken({
								message: `${params.email} is already registered`,
							});
						}

						const passwordHash = yield* passwords.hash(params.password);
						const user = yield* repo.createUser({
							email: params.email,
							phone: params.phone,
							passwordHash,
							fullname: params.fullname,
						});

						const token = Buffer.from(
							crypto.getRandomValues(new Uint8Array(32)),
						).toString("hex");
						const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

						yield* repo.storeVerificationToken({
							userId: user.id,
							token,
							expiresAt,
						});

						yield* email
							.sendVerificationEmail({
								to: user.email,
								fullname: user.fullname,
								token,
							})
							.pipe(
								Effect.catch((e) =>
									Effect.logWarning(
										`Failed to send verification email: ${JSON.stringify(e)}`,
									),
								),
							);
						yield* logger.logAuthEvent({
							event: "sign_up",
							userId: user.id,
							email: user.email,
							success: true,
						});

						return yield* issueTokens(user.id, user.email) as Effect.Effect<
							AuthTokens,
							never
						>;
					}),
			);

			const signIn = Effect.fn("AuthService.signIn")(
				(params: {
					email: string;
					password: string;
				}): Effect.Effect<AuthTokens, SignInError> =>
					Effect.gen(function* () {
						const maybeUser = yield* repo.findByEmail(params.email);

						const user = yield* Option.match(maybeUser, {
							onNone: () =>
								Effect.fail(
									new InvalidCredentials({
										message: "Invalid email or password",
									}),
								),
							onSome: Effect.succeed,
						});

						const valid = yield* passwords.verify(
							user.passwordHash,
							params.password,
						);

						if (!valid) {
							yield* logger.logAuthEvent({
								event: "sign_in",
								email: params.email,
								userId: user.id,
								success: false,
							});
							return yield* new InvalidCredentials({
								message: "Invalid email or password",
							});
						}

						if (!user.emailVerified) {
							return yield* new EmailNotVerified({
								message: "Please verify your email before signing in",
							});
						}

						const tokens = yield* issueTokens(user.id, user.email);

						yield* logger.logAuthEvent({
							event: "sign_in",
							userId: user.id,
							email: user.email,
							success: true,
						});

						return tokens;
					}),
			);

			const refresh = Effect.fn("AuthService.refresh")(
				(rawRefreshToken: string): Effect.Effect<AuthTokens, RefreshError> =>
					Effect.gen(function* () {
						const tokenHash = tokens.hashToken(rawRefreshToken);
						const maybeToken = yield* repo.findRefreshToken(tokenHash);

						const storedToken = yield* Option.match(maybeToken, {
							onNone: () =>
								Effect.fail(
									new InvalidToken({
										message: "Refresh token not found",
									}),
								),
							onSome: Effect.succeed,
						});

						if (storedToken.revokedAt !== null) {
							// Reuse detected — revoke all tokens for this user (theft scenario)
							yield* repo.revokeAllUserTokens(storedToken.userId);
							return yield* new InvalidToken({
								message: "Refresh token already used",
							});
						}

						if (storedToken.expiresAt < new Date()) {
							return yield* new TokenExpired({
								message: "Refresh token expired",
							});
						}

						yield* repo.revokeRefreshToken(storedToken.id);

						const maybeUser = yield* repo.findById(storedToken.userId);
						const user = yield* Option.match(maybeUser, {
							onNone: () =>
								Effect.fail(
									new InvalidToken({
										message: "User not found",
									}),
								),
							onSome: Effect.succeed,
						});

						return yield* issueTokens(user.id, user.email);
					}),
			);

			const signOut = Effect.fn("AuthService.signOut")(
				(rawRefreshToken: string): Effect.Effect<void, SignOutError> =>
					Effect.gen(function* () {
						const tokenHash = tokens.hashToken(rawRefreshToken);
						const maybeToken = yield* repo.findRefreshToken(tokenHash);

						yield* Option.match(maybeToken, {
							onNone: () => Effect.void,
							onSome: (t) => repo.revokeRefreshToken(t.id),
						});
					}),
			);

			const verifyEmail = Effect.fn("AuthService.verifyEmail")(
				(
					token: string,
				): Effect.Effect<void, InvalidVerificationToken | TokenExpiredError> =>
					Effect.gen(function* () {
						const maybeUser = yield* repo
							.findByVerificationToken(token)
							.pipe(Effect.orDie);

						const user = yield* Option.match(maybeUser, {
							onNone: () =>
								Effect.fail(
									new InvalidVerificationToken({
										message: "Invalid verification token",
									}),
								),
							onSome: Effect.succeed,
						});

						if (
							!user.verificationTokenExpiresAt ||
							user.verificationTokenExpiresAt < new Date()
						) {
							return yield* new TokenExpiredError({
								message: "Verification token has expired",
							});
						}

						yield* repo.markEmailVerified(user.id).pipe(Effect.orDie);
					}),
			);

			return { signUp, signIn, refresh, signOut, verifyEmail };
		}),
	);
}
