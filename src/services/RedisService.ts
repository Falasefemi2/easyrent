import { Context, Effect, Layer, Schema } from "effect";
import Redis from "ioredis";
import { loadConfig } from "../lib/config";

export class RedisError extends Schema.TaggedErrorClass<RedisError>()(
	"RedisError",
	{ message: Schema.String },
) {}

export class RedisService extends Context.Service<
	RedisService,
	{
		readonly get: (key: string) => Effect.Effect<string | null, RedisError>;
		readonly set: (
			key: string,
			value: string,
			ttlSeconds: number,
		) => Effect.Effect<void, RedisError>;
		readonly del: (...keys: string[]) => Effect.Effect<void, RedisError>;
		readonly delPattern: (pattern: string) => Effect.Effect<void, RedisError>;
		readonly incr: (key: string) => Effect.Effect<number, RedisError>;
		readonly expire: (
			key: string,
			seconds: number,
		) => Effect.Effect<void, RedisError>;
		readonly ttl: (key: string) => Effect.Effect<number, RedisError>;
	}
>()("easyrent/services/RedisService") {
	static readonly layer = Layer.effect(
		RedisService,
		Effect.gen(function* () {
			const config = yield* loadConfig;
			const client = new Redis(config.REDIS_URL);
			// fail fast if redis is unreachable during startup
			yield* Effect.tryPromise({
				try: () => client.ping(),
				catch: (e) =>
					new RedisError({ message: `redis connection failed: ${e}` }),
			});
			yield* Effect.logInfo("redis connected");

			const get = Effect.fn("RedisService.get")(
				(key: string): Effect.Effect<string | null, RedisError> =>
					Effect.tryPromise({
						try: () => client.get(key),
						catch: (e) => new RedisError({ message: `redis get failed: ${e}` }),
					}),
			);

			const set = Effect.fn("RedisService.set")(
				(
					key: string,
					value: string,
					ttlSeconds: number,
				): Effect.Effect<void, RedisError> =>
					Effect.tryPromise({
						try: () =>
							client.set(key, value, "EX", ttlSeconds).then(() => void 0),
						catch: (e) => new RedisError({ message: `redis set failed: ${e}` }),
					}),
			);

			const del = Effect.fn("RedisService.del")(
				(...keys: string[]): Effect.Effect<void, RedisError> =>
					Effect.tryPromise({
						try: () => client.del(...keys).then(() => void 0),
						catch: (e) => new RedisError({ message: `redis del failed: ${e}` }),
					}),
			);

			const delPattern = Effect.fn("RedisService.delPattern")(
				(pattern: string): Effect.Effect<void, RedisError> =>
					Effect.gen(function* () {
						const keys = yield* Effect.tryPromise({
							try: () => client.keys(pattern),
							catch: (e) =>
								new RedisError({ message: `redis del failed: ${e}` }),
						});
						if (keys.length > 0) {
							yield* Effect.tryPromise({
								try: () => client.del(...keys).then(() => void 0),
								catch: (e) =>
									new RedisError({ message: `Redis DEL failed: ${e}` }),
							});
						}
					}),
			);

			const incr = Effect.fn("RedisService.incr")(
				(key: string): Effect.Effect<number, RedisError> =>
					Effect.tryPromise({
						try: () => client.incr(key),
						catch: (e) =>
							new RedisError({ message: `Redis INCR failed: ${e}` }),
					}),
			);

			const expire = Effect.fn("RedisService.expire")(
				(key: string, seconds: number): Effect.Effect<void, RedisError> =>
					Effect.tryPromise({
						try: () => client.expire(key, seconds).then(() => void 0),
						catch: (e) =>
							new RedisError({ message: `Redis EXPIRE failed: ${e}` }),
					}),
			);

			const ttl = Effect.fn("RedisService.ttl")(
				(key: string): Effect.Effect<number, RedisError> =>
					Effect.tryPromise({
						try: () => client.ttl(key),
						catch: (e) => new RedisError({ message: `Redis TTL failed: ${e}` }),
					}),
			);
			return { get, set, del, delPattern, incr, expire, ttl };
		}),
	);
}
