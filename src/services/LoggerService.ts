import { Axiom } from "@axiomhq/js"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { loadConfig } from "../lib/config"

type LogLevel = "info" | "warn" | "error" | "debug"

type LogMetadata = Readonly<Record<string, string | number | boolean | null | undefined>>

class AxiomError extends Schema.TaggedError<AxiomError>()("AxiomError", {
  message: Schema.String,
}) {}

interface LogEvent {
  level: LogLevel
  message: string
  service?: string
  userId?: string
  listingId?: string
  duration?: number
  error?: string
  metadata?: LogMetadata
}

export class LoggerService extends Context.Service<
  LoggerService,
  {
    readonly info: (message: string, metadata?: LogMetadata) => Effect.Effect<void>
    readonly warn: (message: string, metadata?: LogMetadata) => Effect.Effect<void>
    readonly error: (message: string, cause?: unknown, metadata?: LogMetadata) => Effect.Effect<void>
    readonly debug: (message: string, metadata?: LogMetadata) => Effect.Effect<void>
    readonly logRequest: (params: {
      method: string
      url: string
      status: number
      duration: number
      userId?: string
    }) => Effect.Effect<void>
    readonly logAuthEvent: (params: {
      event: "sign_up" | "sign_in" | "sign_out" | "token_refresh" | "rate_limited"
      userId?: string
      email?: string
      ip?: string
      success: boolean
    }) => Effect.Effect<void>
  }
>()("easyrent/services/LoggerService/LoggerService") {
  static readonly layer = Layer.effect(
    LoggerService,
    Effect.gen(function* () {
      const config = yield* loadConfig
      const axiom = new Axiom({
        token: config.AXIOM_TOKEN,
      })
      const dataset = config.AXIOM_DATASET

      const send = (event: LogEvent): Effect.Effect<void> =>
        Effect.tryPromise({
          try: async () => {
            axiom.ingest(dataset, [
              {
                _time: new Date().toISOString(),
                environment: process.env.NODE_ENV ?? "production",
                ...event,
              },
            ])
            if (event.level === "error") {
              await axiom.flush()
            }
          },
          catch: () => new AxiomError({ message: "axiom ingest failed" }),
        }).pipe(Effect.orDie)

      const info = (message: string, metadata?: LogMetadata) =>
        send({ level: "info", message, metadata }).pipe(
          Effect.forkDetach, // fire and forget
          Effect.asVoid,
        )

      const warn = (message: string, metadata?: LogMetadata) =>
        send({ level: "warn", message, metadata }).pipe(Effect.forkDetach, Effect.asVoid)

      const error = (message: string, cause?: unknown, metadata?: LogMetadata) =>
        send({
          level: "error",
          message,
          error: cause instanceof Error ? cause.message : String(cause),
          metadata,
        }).pipe(Effect.asVoid) // errors flush synchronously, no fork

      const debug = (message: string, metadata?: LogMetadata) =>
        process.env.NODE_ENV === "development"
          ? send({ level: "debug", message, metadata }).pipe(Effect.forkDetach, Effect.asVoid)
          : Effect.void

      const logRequest = (params: { method: string; url: string; status: number; duration: number; userId?: string }) =>
        send({
          level: params.status >= 500 ? "error" : params.status >= 400 ? "warn" : "info",
          message: `${params.method} ${params.url} ${params.status}`,
          service: "http",
          userId: params.userId,
          duration: params.duration,
          metadata: {
            method: params.method,
            url: params.url,
            status: params.status,
          },
        }).pipe(Effect.forkDetach, Effect.asVoid)

      const logAuthEvent = (params: {
        event: "sign_up" | "sign_in" | "sign_out" | "token_refresh" | "rate_limited"
        userId?: string
        email?: string
        ip?: string
        success: boolean
      }) =>
        send({
          level: params.success ? "info" : "warn",
          message: `auth.${params.event}`,
          service: "auth",
          userId: params.userId,
          metadata: {
            event: params.event,
            email: params.email,
            ip: params.ip,
            success: params.success,
          },
        }).pipe(Effect.forkDetach, Effect.asVoid)

      // Flush on process exit
      process.on("beforeExit", () => axiom.flush())

      return { info, warn, error, debug, logRequest, logAuthEvent }
    }),
  )
}
