import { and, eq, isNull } from "drizzle-orm";
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import { Context, Effect, Layer, Option } from "effect";
import { PgDatabase } from "../db";
import { refreshTokens, users } from "../db/schema";

export interface CreateUserParams {
	email: string;
	phone: string;
	passwordHash: string;
	fullname: string;
}

export interface UserRow {
	id: string;
	email: string;
	phone: string;
	passwordHash: string;
	fullname: string;
	avatarUrl: string | null;
	emailVerified: boolean;
	verificationToken: string | null;
	verificationTokenExpiresAt: Date | null;
}

export interface RefreshTokenRow {
	id: string;
	userId: string;
	expiresAt: Date;
	revokedAt: Date | null;
}

type DbEffect<A> = Effect.Effect<A, EffectDrizzleQueryError>;

export class AuthRepository extends Context.Service<
	AuthRepository,
	{
		readonly findByEmail: (email: string) => DbEffect<Option.Option<UserRow>>;
		readonly findById: (id: string) => DbEffect<Option.Option<UserRow>>;
		readonly createUser: (params: CreateUserParams) => DbEffect<UserRow>;
		readonly storeRefreshToken: (params: {
			userId: string;
			tokenHash: string;
			expiresAt: Date;
		}) => DbEffect<void>;
		readonly findRefreshToken: (
			tokenHash: string,
		) => DbEffect<Option.Option<RefreshTokenRow>>;
		readonly revokeRefreshToken: (id: string) => DbEffect<void>;
		readonly revokeAllUserTokens: (userId: string) => DbEffect<void>;
		readonly storeVerificationToken: (params: {
			userId: string;
			token: string;
			expiresAt: Date;
		}) => Effect.Effect<void, EffectDrizzleQueryError>;

		readonly findByVerificationToken: (
			token: string,
		) => Effect.Effect<Option.Option<UserRow>, EffectDrizzleQueryError>;

		readonly markEmailVerified: (
			userId: string,
		) => Effect.Effect<void, EffectDrizzleQueryError>;
	}
>()("easyrent/auth/AuthRepository") {
	static readonly layer = Layer.effect(
		AuthRepository,
		Effect.gen(function* () {
			const db = yield* PgDatabase;

			const findByEmail = Effect.fn("AuthRepository.findByEmail")(
				(email: string): DbEffect<Option.Option<UserRow>> =>
					Effect.gen(function* () {
						const rows = yield* db
							.select()
							.from(users)
							.where(eq(users.email, email))
							.limit(1);
						return Option.fromNullOr(rows[0] ?? null);
					}),
			);

			const findById = Effect.fn("AuthRepository.findById")(
				(id: string): DbEffect<Option.Option<UserRow>> =>
					Effect.gen(function* () {
						const rows = yield* db
							.select()
							.from(users)
							.where(eq(users.id, id))
							.limit(1);
						return Option.fromNullOr(rows[0] ?? null);
					}),
			);

			const createUser = Effect.fn("AuthRepository.createUser")(
				(params: CreateUserParams): DbEffect<UserRow> =>
					Effect.gen(function* () {
						const rows = yield* db
							.insert(users)
							.values({
								email: params.email,
								phone: params.phone,
								passwordHash: params.passwordHash,
								fullname: params.fullname,
							})
							.returning();
						return rows[0]!;
					}),
			);

			const storeRefreshToken = Effect.fn("AuthRepository.storeRefreshToken")(
				(params: {
					userId: string;
					tokenHash: string;
					expiresAt: Date;
				}): DbEffect<void> =>
					db.insert(refreshTokens).values({
						userId: params.userId,
						tokenHash: params.tokenHash,
						expiresAt: params.expiresAt,
					}),
			);

			const findRefreshToken = Effect.fn("AuthRepository.findRefreshToken")(
				(tokenHash: string): DbEffect<Option.Option<RefreshTokenRow>> =>
					Effect.gen(function* () {
						const rows = yield* db
							.select()
							.from(refreshTokens)
							.where(eq(refreshTokens.tokenHash, tokenHash))
							.limit(1);
						return Option.fromNullOr(rows[0] ?? null);
					}),
			);

			const revokeRefreshToken = Effect.fn("AuthRepository.revokeRefreshToken")(
				(id: string): DbEffect<void> =>
					db
						.update(refreshTokens)
						.set({
							revokedAt: new Date(),
						})
						.where(eq(refreshTokens.id, id)),
			);

			const revokeAllUserTokens = Effect.fn(
				"AuthRepository.revokeAllUserTokens",
			)(
				(userId: string): DbEffect<void> =>
					db
						.update(refreshTokens)
						.set({
							revokedAt: new Date(),
						})
						.where(
							and(
								eq(refreshTokens.userId, userId),
								isNull(refreshTokens.revokedAt),
							),
						),
			);

			const storeVerificationToken = Effect.fn(
				"AuthRepository.storeVerificationToken",
			)(
				(params: {
					userId: string;
					token: string;
					expiresAt: Date;
				}): DbEffect<void> =>
					Effect.gen(function* () {
						yield* db
							.update(users)
							.set({
								verificationToken: params.token,
								verificationTokenExpiresAt: params.expiresAt,
							})
							.where(eq(users.id, params.userId));
					}),
			);

			const findByVerificationToken = Effect.fn(
				"AuthRepository.findByVerificationToken",
			)(
				(token: string): DbEffect<Option.Option<UserRow>> =>
					Effect.gen(function* () {
						const rows = yield* db
							.select()
							.from(users)
							.where(eq(users.verificationToken, token))
							.limit(1);
						return Option.fromNullOr(rows[0] ?? null);
					}),
			);

			const markEmailVerified = Effect.fn("AuthRepository.markEmailVerified")(
				(userId: string): DbEffect<void> =>
					Effect.gen(function* () {
						yield* db
							.update(users)
							.set({
								emailVerified: true,
								verificationToken: null,
								verificationTokenExpiresAt: null,
							})
							.where(eq(users.id, userId));
					}),
			);

			return {
				findByEmail,
				findById,
				createUser,
				storeRefreshToken,
				findRefreshToken,
				revokeRefreshToken,
				revokeAllUserTokens,
				storeVerificationToken,
				findByVerificationToken,
				markEmailVerified,
			};
		}),
	);
}
