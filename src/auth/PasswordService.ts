import argon2 from "argon2";
import { Context, Effect, Layer, Schema } from "effect";

export class HashError extends Schema.TaggedErrorClass<HashError>()(
	"HashError",
	{
		message: Schema.String,
	},
) {}

export class PasswordService extends Context.Service<
	PasswordService,
	{
		readonly hash: (password: string) => Effect.Effect<string, HashError>;
		readonly verify: (
			hash: string,
			password: string,
		) => Effect.Effect<boolean, HashError>;
	}
>()("easyrent/auth/PasswordService") {
	static readonly layer = Layer.effect(
		PasswordService,
		Effect.gen(function* () {
			const hash = Effect.fn("PasswordService.hash")(
				(password: string): Effect.Effect<string, HashError> =>
					Effect.gen(function* () {
						return yield* Effect.tryPromise({
							try: () =>
								argon2.hash(password, {
									type: argon2.argon2id,
								}),
							catch: (e) =>
								new HashError({
									message: `Password hashing failed: ${e}`,
								}),
						});
					}),
			);

			const verify = Effect.fn("PasswordService.verify")(
				(hash_: string, password: string): Effect.Effect<boolean, HashError> =>
					Effect.gen(function* () {
						return yield* Effect.tryPromise({
							try: () => argon2.verify(hash_, password),
							catch: (e) =>
								new HashError({
									message: `Password verification failed: ${e}`,
								}),
						});
					}),
			);

			return { hash, verify };
		}),
	);
}
