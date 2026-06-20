import { eq } from "drizzle-orm";
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import { Context, Effect, Layer, Option } from "effect";
import { PgDatabase } from "../db";
import { users } from "../db/schema";

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
				fullname: string;
				phone: string;
				createdAt: Date;
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
					db
						.update(users)
						.set({
							avatarUrl,
							updatedAt: new Date(),
						})
						.where(eq(users.id, userId)),
			);

			const findById = Effect.fn("UsersRepository.findById")(
				(
					userId: string,
				): DbEffect<
					Option.Option<{
						id: string;
						email: string;
						avatarUrl: string | null;
						fullname: string;
						phone: string;
						createdAt: Date;
					}>
				> =>
					Effect.gen(function* () {
						const rows = yield* db
							.select({
								id: users.id,
								email: users.email,
								avatarUrl: users.avatarUrl,
								fullname: users.fullname,
								phone: users.phone,
								createdAt: users.createdAt,
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
