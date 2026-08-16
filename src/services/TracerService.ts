import type * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Tracer from "effect/Tracer"
import type { Exit } from "effect/Exit"
import type { AnySpan, SpanLink, SpanStatus } from "effect/Tracer"
import { randomBytes } from "node:crypto"
import * as fs from "node:fs"

const randomId = () => randomBytes(8).toString("hex")

interface TraceRecord {
  name: string
  traceId: string
  spanId: string
  parent: string | null
  startTimeMs: number
  durationMs: number
  kind: Tracer.SpanKind
  attributes: Record<string, unknown>
}

class LoggingSpan implements Tracer.Span {
  readonly _tag = "Span"
  readonly name: string
  readonly spanId: string
  readonly traceId: string
  readonly parent: Option.Option<AnySpan>
  readonly annotations: Context.Context<never>
  readonly links: Array<SpanLink>
  readonly startTime: bigint
  readonly kind: Tracer.SpanKind
  readonly sampled: boolean
  status: SpanStatus
  attributes = new Map<string, unknown>()

  constructor(options: {
    readonly name: string
    readonly parent: Option.Option<AnySpan>
    readonly annotations: Context.Context<never>
    readonly links: Array<SpanLink>
    readonly startTime: bigint
    readonly kind: Tracer.SpanKind
    readonly sampled: boolean
  }) {
    this.name = options.name
    this.spanId = randomId()
    this.traceId = Option.match(options.parent, {
      onNone: () => randomId(),
      onSome: (parent) => parent.traceId,
    })
    this.parent = options.parent
    this.annotations = options.annotations
    this.links = options.links
    this.startTime = options.startTime
    this.kind = options.kind
    this.sampled = options.sampled
    this.status = { _tag: "Started", startTime: options.startTime }
  }

  end(endTime: bigint, exit: Exit<unknown, unknown>): void {
    this.status = { _tag: "Ended", startTime: this.startTime, endTime, exit }
    emitSpan(this)
  }

  attribute(key: string, value: unknown): void {
    this.attributes.set(key, value)
  }

  event(_name: string, _startTime: bigint, _attributes?: Record<string, unknown>): void {}

  addLinks(links: ReadonlyArray<SpanLink>): void {
    this.links.push(...links)
  }
}

const toTraceRecord = (span: LoggingSpan): TraceRecord | null => {
  if (span.status._tag !== "Ended") return null
  return {
    name: span.name,
    traceId: span.traceId,
    spanId: span.spanId,
    parent: Option.match(span.parent, {
      onNone: () => null,
      onSome: (p) => p.spanId,
    }),
    startTimeMs: Number(span.status.startTime) / 1e6,
    durationMs: Number(span.status.endTime - span.status.startTime) / 1e6,
    kind: span.kind,
    attributes: Object.fromEntries(span.attributes),
  }
}

const traceFile = process.env.TRACE_FILE
const logToConsole = process.env.TRACE_SPANS === "1"

const emitSpan = (span: LoggingSpan): void => {
  const record = toTraceRecord(span)
  if (!record) return

  if (logToConsole) {
    console.log(`[trace] ${record.name} ${record.durationMs.toFixed(3)}ms (${record.kind})`)
  }

  if (traceFile) {
    fs.appendFileSync(traceFile, `${JSON.stringify(record)}\n`)
  }
}

export const TracingLive = Layer.effect(
  Tracer.Tracer,
  Effect.sync(() =>
    Tracer.make({
      span(options) {
        return new LoggingSpan(options)
      },
    }),
  ),
)

export const withDbSpan = <A, E, R>(
  name: string,
  table: string,
  operation: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> => effect.pipe(Effect.withSpan(name, { attributes: { category: "db", table, operation } }))

export const withRedisSpan = <A, E, R>(name: string, effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  effect.pipe(Effect.withSpan(name, { attributes: { category: "redis" } }))

export const withExternalSpan = <A, E, R>(name: string, effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  effect.pipe(Effect.withSpan(name, { attributes: { category: "external" }, kind: "client" }))
