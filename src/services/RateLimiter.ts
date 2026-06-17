import { Context, Effect, Layer, Schema, Option } from "effect";
import { RedisService } from "./RedisService";
import { HttpServerRequest } from "effect/unstable/http";
import { LoggerService } from "./LoggerService";

export class RateLimitExceeded extends Schema.TaggedErrorClass<RateLimitExceeded>()(
	"RateLimitExceeded",
	{
		message: Schema.String,
		retryAfter: Schema.Number,
	},
	{ httpApiStatus: 429 },
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
			const logger = yield* LoggerService;

			const check = (params: {
				key: string;
				limit: number;
				windowSeconds: number;
			}) =>
				Effect.gen(function* () {
					const count = yield* redis
						.incr(params.key)
						.pipe(Effect.catchTag("RedisError", () => Effect.succeed(0)));

					let ttl = yield* redis
						.ttl(params.key)
						.pipe(Effect.catchTag("RedisError", () => Effect.succeed(-1)));

					if (ttl === -1) {
						yield* redis
							.expire(params.key, params.windowSeconds)
							.pipe(Effect.catchTag("RedisError", () => Effect.void));
						ttl = params.windowSeconds;
					}

					if (count > params.limit) {
						yield* logger.warn("Rate limit exceeded", {
							key: params.key,
							limit: params.limit,
							count,
							windowSeconds: params.windowSeconds,
						});
						const retryAfter = ttl > 0 ? ttl : params.windowSeconds;
						return yield* new RateLimitExceeded({
							message: `Too many requests. Try again in ${retryAfter} seconds.`,
							retryAfter,
						});
					}
				});

			return RateLimiter.of({
				check,
				checkRequest: (params) =>
					Effect.gen(function* () {
						const req = yield* HttpServerRequest.HttpServerRequest;
						const ip =
							(req.headers["cf-connecting-ip"] as string) ??
							(req.headers["x-forwarded-for"] as string)
								?.split(",")[0]
								?.trim() ??
							(req.headers["x-real-ip"] as string) ??
							Option.getOrElse(req.remoteAddress, () => "unknown");

						return yield* check({
							key: `ratelimit:${params.prefix}:${ip}`,
							limit: params.limit,
							windowSeconds: params.windowSeconds,
						});
					}),
			});
		}),
	);
}
