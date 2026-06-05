import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import { Effect, Context, Option, Layer } from "effect";
import { PgDatabase } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

type DbEffect<A> = Effect.Effect<A, EffectDrizzleQueryError>;

export class UsersRepository extends Context.Service<
	UsersRepository,
	{
		readonly updateAvatar: (
			userId: string,
			avatarUrl: string,
		) => DbEffect<void>;
		readonly findById: (userId: string) => DbEffect<
			Option.Option<{
				id: string;
				email: string;
				avatarUrl: string | null;
			}>
		>;
	}
>()("easyrent/users/UsersRepository/UserRepository") {
	static readonly layer = Layer.effect(
		UsersRepository,
		Effect.gen(function* () {
			const db = yield* PgDatabase;

			const updateAvatar = Effect.fn("UsersRepository.updateAvatar")(
				(userId: string, avatarUrl: string): DbEffect<void> =>
					Effect.gen(function* () {
						yield* db
							.update(users)
							.set({
								avatarUrl,
								updatedAt: new Date(),
							})
							.where(eq(users.id, userId));
					}),
			);

			const findById = Effect.fn("UsersRepository.findById")(
				(
					userId: string,
				): DbEffect<
					Option.Option<{
						id: string;
						email: string;
						avatarUrl: string | null;
					}>
				> =>
					Effect.gen(function* () {
						const rows = yield* db
							.select({
								id: users.id,
								email: users.email,
								avatarUrl: users.avatarUrl,
							})
							.from(users)
							.where(eq(users.id, userId))
							.limit(1);
						return Option.fromNullishOr(rows[0] ?? null);
					}),
			);

			return { updateAvatar, findById };
		}),
	);
}
