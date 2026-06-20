import { Clock, Effect } from "effect";
import { HttpMiddleware, HttpServerRequest } from "effect/unstable/http";
import { LoggerService } from "../services/LoggerService";

export const RequestLoggerMiddleware = HttpMiddleware.make((httpApp) =>
	Effect.gen(function* () {
		const req = yield* HttpServerRequest.HttpServerRequest;
		const start = yield* Clock.currentTimeMillis;

		const response = yield* httpApp;

		const duration = (yield* Clock.currentTimeMillis) - start;

		yield* Effect.gen(function* () {
			const logger = yield* LoggerService;
			yield* logger.logRequest({
				method: req.method,
				url: req.url,
				status: response.status,
				duration,
			});
		}).pipe(Effect.catch(() => Effect.void)); // never let logging fail the request

		return response;
	}),
);
