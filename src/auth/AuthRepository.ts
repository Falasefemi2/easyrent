import { Context, Effect, Layer, Option } from "effect";
import { eq, and, isNull } from "drizzle-orm";
import { PgDatabase } from "../db";
import { users, refreshTokens } from "../db/schema";
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core";

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

			return {
				findByEmail,
				findById,
				createUser,
				storeRefreshToken,
				findRefreshToken,
				revokeRefreshToken,
				revokeAllUserTokens,
			};
		}),
	);
}
