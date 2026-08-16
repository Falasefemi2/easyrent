#!/usr/bin/env bun
/**
 * Perf load harness for EasyRent.
 *
 * Hits a set of representative endpoints with bounded concurrency and reports
 * p50/p95/p99 latency per endpoint. Pair with scripts/perf/analyze-traces.ts
 * (fed by TRACE_FILE on the server) for the DB/Redis/external breakdown.
 *
 * Env:
 *   BASE_URL     base URL            (default http://localhost:3000)
 *   CONCURRENCY  parallel workers    (default 8)
 *   REQUESTS     requests per endpoint (default 200)
 *   WARMUP       warmup requests per endpoint (default 20, discarded)
 *   SEED_EMAIL   sign-in email       (default perf@easyrent.test)
 *   SEED_PASSWORD sign-in password   (default password123)
 */

interface Endpoint {
  name: string
  method: "GET" | "POST" | "PATCH" | "DELETE"
  path: string
  auth?: boolean
  body?: unknown
}

interface Sample {
  name: string
  ok: boolean
  status: number
  ms: number
}

const BASE = process.env.BASE_URL ?? "http://localhost:3000"
const CONCURRENCY = Number(process.env.CONCURRENCY ?? "8")
const REQUESTS = Number(process.env.REQUESTS ?? "200")
const WARMUP = Number(process.env.WARMUP ?? "20")
const SEED_EMAIL = process.env.SEED_EMAIL ?? "perf@easyrent.test"
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "password123"

// Representative read-heavy hot endpoints. Placeholders are resolved at runtime.
const LISTING_IDS = new Set<string>()
const MY_LISTING_IDS = new Set<string>()

const endpoints = (): Endpoint[] => [
  { name: "listings.list", method: "GET", path: "/listings?page=1&limit=20" },
  { name: "listings.search", method: "GET", path: "/listings?page=1&limit=20&search=Lekki" },
  { name: "listings.filter", method: "GET", path: "/listings?page=1&limit=20&status=avaiable&minRooms=2" },
  { name: "listings.getById", method: "GET", path: "/listings/:listingId" },
  { name: "auth.signin", method: "POST", path: "/auth/sign-in", body: { email: SEED_EMAIL, password: SEED_PASSWORD } },
  { name: "users.me", method: "GET", path: "/users/me", auth: true },
  { name: "listings.myListings", method: "GET", path: "/listings/my?page=1&limit=20", auth: true },
  { name: "favorites.myFavorites", method: "GET", path: "/favorites?page=1&limit=20", auth: true },
]

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0
  const idx = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[idx] ?? 0
}

const summarize = (samples: Sample[]): Record<string, unknown> => {
  const ok = samples.filter((s) => s.ok)
  const times = ok.map((s) => s.ms).sort((a, b) => a - b)
  const mean = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0
  return {
    n: samples.length,
    ok: ok.length,
    failures: samples.length - ok.length,
    p50Ms: round1(percentile(times, 50)),
    p90Ms: round1(percentile(times, 90)),
    p95Ms: round1(percentile(times, 95)),
    p99Ms: round1(percentile(times, 99)),
    maxMs: round1(times.at(-1) ?? 0),
    meanMs: round1(mean),
  }
}

const round1 = (n: number): number => Math.round(n * 10) / 10

async function signIn(): Promise<string> {
  const res = await fetch(`${BASE}/auth/sign-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: SEED_EMAIL, password: SEED_PASSWORD }),
  })
  if (!res.ok) throw new Error(`sign-in failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { accessToken: string }
  return data.accessToken
}

async function resolvePath(path: string, listingId: string): Promise<string> {
  return path.replace(":listingId", listingId)
}

async function prime(tokens: { access: string }): Promise<void> {
  // Grab a set of listing ids so getById has real variety to target.
  const listRes = await fetch(`${BASE}/listings?page=1&limit=20`)
  if (listRes.ok) {
    const list = (await listRes.json()) as { data: Array<{ id: string }> }
    for (const row of list.data.slice(0, 20)) LISTING_IDS.add(row.id)
  }
  const mine = await fetch(`${BASE}/listings/my?page=1&limit=10`, {
    headers: { Authorization: `Bearer ${tokens.access}` },
  })
  if (mine.ok) {
    const list = (await mine.json()) as { data: Array<{ id: string }> }
    for (const row of list.data) MY_LISTING_IDS.add(row.id)
  }
}

async function runEndpoint(ep: Endpoint, token: string): Promise<Sample> {
  const listingId = [...LISTING_IDS][Math.floor(Math.random() * LISTING_IDS.size)] ?? ""
  const path = await resolvePath(ep.path, listingId)
  const started = performance.now()
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: ep.method,
      headers: {
        "Content-Type": "application/json",
        ...(ep.auth && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: ep.body ? JSON.stringify(ep.body) : undefined,
    })
    await res.arrayBuffer()
    return { name: ep.name, ok: res.ok, status: res.status, ms: performance.now() - started }
  } catch (e) {
    return { name: ep.name, ok: false, status: 0, ms: performance.now() - started }
  }
}

async function loadEndpoint(ep: Endpoint, token: string): Promise<Sample[]> {
  const samples: Sample[] = []

  const worker = async (): Promise<void> => {
    while (true) {
      const idx = samples.length
      if (idx >= REQUESTS + WARMUP) return
      samples.push(await runEndpoint(ep, token))
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker())
  await Promise.all(workers)
  return samples.slice(WARMUP)
}

async function main(): Promise<void> {
  const token = await signIn()
  await prime({ access: token })

  const report: Record<string, Record<string, unknown>> = {}
  for (const ep of endpoints()) {
    const samples = await loadEndpoint(ep, token)
    report[ep.name] = summarize(samples)
  }

  const out = process.env.OUT
  if (out) {
    await Bun.write(out, JSON.stringify(report, null, 2))
    console.log(`wrote report to ${out}`)
  }
  for (const [name, s] of Object.entries(report)) {
    console.log(
      `${name.padEnd(24)} p50=${(s.p50Ms as number).toFixed(1)}ms p90=${(s.p90Ms as number).toFixed(1)}ms p95=${(s.p95Ms as number).toFixed(1)}ms p99=${(s.p99Ms as number).toFixed(1)}ms max=${(s.maxMs as number).toFixed(1)}ms ok=${s.ok}/${s.n}`,
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
