import { Context, Effect, Layer, Schema } from "effect";
import { RedisService } from "./RedisService";
import { HttpServerRequest } from "effect/unstable/http";

export class RateLimitExceeded extends Schema.TaggedErrorClass<RateLimitExceeded>()(
	"RateLimitExceeded",
	{
		message: Schema.String,
		retryAfter: Schema.Number,
	},
) {}

export class RateLimiter extends Context.Service<
	RateLimiter,
	{
		readonly check: (params: {
			key: string;
			limit: number;
			windowSeconds: number;
		}) => Effect.Effect<void, RateLimitExceeded>;

		readonly checkRequest: (params: {
			prefix: string;
			limit: number;
			windowSeconds: number;
		}) => Effect.Effect<
			void,
			RateLimitExceeded,
			HttpServerRequest.HttpServerRequest
		>;
	}
>()("easyrent/services/RateLimiter") {
	static readonly layer = Layer.effect(
		RateLimiter,
		Effect.gen(function* () {
			const redis = yield* RedisService;

			const check = Effect.fn("RateLimiter.check")(
				({
					key,
					limit,
					windowSeconds,
				}: {
					key: string;
					limit: number;
					windowSeconds: number;
				}): Effect.Effect<void, RateLimitExceeded> =>
					Effect.gen(function* () {
						const count = yield* redis
							.incr(key)
							.pipe(Effect.catchTag("RedisError", () => Effect.succeed(0)));

						if (count === 1) {
							yield* redis
								.expire(key, windowSeconds)
								.pipe(Effect.catchTag("RedisError", () => Effect.void));
						}

						if (count > limit) {
							return yield* new RateLimitExceeded({
								message: `Too many requests. Try again in ${windowSeconds} seconds.`,
								retryAfter: windowSeconds,
							});
						}
					}),
			);

			const checkRequest = Effect.fn("RateLimiter.checkRequest")(
				({
					prefix,
					limit,
					windowSeconds,
				}: {
					prefix: string;
					limit: number;
					windowSeconds: number;
				}): Effect.Effect<void, RateLimitExceeded> =>
					Effect.gen(function* () {
						const req = yield* HttpServerRequest.HttpServerRequest;
						const ip =
							(req.headers["x-forwarded-for"] as string)
								?.split(",")[0]
								?.trim() ??
							(req.headers["x-real-ip"] as string) ??
							"unknown";

						yield* check({
							key: `ratelimit:${prefix}:${ip}`,
							limit,
							windowSeconds,
						});
					}),
			);

			return { check, checkRequest };
		}),
	);
}
