#!/usr/bin/env bun
/**
 * Aggregates the server-side span JSONL produced by TracerService (TRACE_FILE)
 * into per-endpoint latency percentiles and a DB / Redis / external / other
 * breakdown per request.
 *
 * Usage:
 *   bun scripts/perf/analyze-traces.ts [traces.jsonl] [--top N]
 */

import * as fs from "node:fs"

interface SpanRecord {
  name: string
  traceId: string
  spanId: string
  parent: string | null
  startTimeMs: number
  durationMs: number
  kind: string
  attributes: Record<string, unknown>
}

const file = process.argv[2] ?? process.env.TRACE_FILE ?? "perf/traces.jsonl"
const topN = Number(process.argv.find((a) => a.startsWith("--top"))?.split("=")[1] ?? "10")

const lines = fs
  .readFileSync(file, "utf8")
  .split("\n")
  .filter((l) => l.trim().length > 0)

const spans: SpanRecord[] = lines.map((l) => JSON.parse(l) as SpanRecord)

const round1 = (n: number): number => Math.round(n * 10) / 10
const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0
}

const summarize = (times: number[]): string => {
  if (times.length === 0) return "-"
  const sorted = [...times].sort((a, b) => a - b)
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length
  return `n=${sorted.length} p50=${round1(percentile(sorted, 50))}ms p95=${round1(percentile(sorted, 95))}ms p99=${round1(percentile(sorted, 99))}ms mean=${round1(mean)}ms`
}

const normalizePath = (name: string): string => {
  const url = name.replace(/^http\.\S+ /, "")
  const path = url.split("?")[0] ?? url
  return path.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
}

const rootSpans = spans.filter((s) => s.kind === "server" && s.name.startsWith("http.") && !s.name.startsWith("http.server"))
const endpointBuckets = new Map<string, SpanRecord[]>()
for (const s of rootSpans) {
  const ep = normalizePath(s.name)
  const bucket = endpointBuckets.get(ep) ?? []
  bucket.push(s)
  endpointBuckets.set(ep, bucket)
}

console.log(`Loaded ${spans.length} spans across ${rootSpans.length} requests\n`)

console.log("=== Per-endpoint total latency ===")
const perEndpoint = new Map<string, Map<string, number[]>>()
for (const [ep, roots] of endpointBuckets) {
  const total: number[] = []
  const db: number[] = []
  const redis: number[] = []
  const external: number[] = []
  for (const root of roots) {
    const children = spans.filter((s) => s.traceId === root.traceId)
    const rootDuration = root.durationMs
    total.push(rootDuration)
    let dbSum = 0
    let redisSum = 0
    let externalSum = 0
    for (const c of children) {
      const cat = c.attributes.category
      if (cat === "db") dbSum += c.durationMs
      else if (cat === "redis") redisSum += c.durationMs
      else if (cat === "external") externalSum += c.durationMs
    }
    db.push(Math.min(dbSum, rootDuration))
    redis.push(Math.min(redisSum, rootDuration))
    external.push(Math.min(externalSum, rootDuration))
  }
  perEndpoint.set(
    ep,
    new Map([
      ["total", total],
      ["db", db],
      ["redis", redis],
      ["external", external],
    ]),
  )
  console.log(`\n${ep}`)
  console.log(`  total:    ${summarize(total)}`)
  console.log(`  db:       ${summarize(db)}`)
  console.log(`  redis:    ${summarize(redis)}`)
  console.log(`  external: ${summarize(external)}`)
}

console.log(`\n=== Top ${topN} spans by total time ===`)
const byName = new Map<string, number[]>()
for (const s of spans) {
  if (s.name.startsWith("http.")) continue
  const bucket = byName.get(s.name) ?? []
  bucket.push(s.durationMs)
  byName.set(s.name, bucket)
}
const ranked = [...byName.entries()].sort((a, b) => b[1].reduce((x, y) => x + y, 0) - a[1].reduce((x, y) => x + y, 0))
for (const [name, times] of ranked.slice(0, topN)) {
  console.log(`  ${name.padEnd(52)} ${summarize(times)}`)
}
