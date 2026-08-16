import { Clock, Effect } from "effect"
import { HttpMiddleware, HttpServerRequest } from "effect/unstable/http"
import { LoggerService } from "../services/LoggerService"

export const RequestLoggerMiddleware = HttpMiddleware.make((httpApp) =>
  Effect.gen(function* () {
    const req = yield* HttpServerRequest.HttpServerRequest
    const start = yield* Clock.currentTimeMillis

    const response = yield* httpApp.pipe(
      Effect.withSpan(`http.${req.method} ${req.url}`, {
        attributes: { method: req.method, url: req.url, category: "request" },
        kind: "server",
      }),
    )

    const duration = (yield* Clock.currentTimeMillis) - start

    yield* Effect.gen(function* () {
      const logger = yield* LoggerService
      yield* logger.logRequest({
        method: req.method,
        url: req.url,
        status: response.status,
        duration,
      })
    }).pipe(Effect.catch(() => Effect.void)) // never let logging fail the request

    return response
  }),
)
