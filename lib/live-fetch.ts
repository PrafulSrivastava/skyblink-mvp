/**
 * Client helpers for the experimental live-fetch page (/live/): types for the api/live.py
 * JSON contract, URL building, input validation, plain-words failure text, shared image
 * stretch and a bounded-concurrency pool.
 *
 * Erasable TypeScript only, no React and no path aliases, so Node can strip the types and
 * run this file directly (scripts/check-live-fetch.mjs).
 */

// ── API contract (field names match api/live.py exactly) ─────────────────────
export type LiveBand = 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6'
export type LiveCollection = 'dr1' | 'qr3'

export interface LiveAttempt {
  n: number
  status: number | null
  ms: number
  error: string | null
}

export interface LiveExposure {
  obsId: string | null
  band: LiveBand
  collection: LiveCollection
  tMin: number
  date: string
  accessUrl: string
  estSizeKb: number | null
}

export interface LiveSearchOk {
  ok: true
  action: 'search'
  query: { ra: number; dec: number; collection: LiveCollection; band: LiveBand; max: number }
  elapsedMs: number
  attempts: LiveAttempt[]
  totalRows: number
  bandCounts: Record<LiveBand, number>
  bandRows: number
  truncated: boolean
  exposures: LiveExposure[]
}

export interface LiveCutoutOk {
  ok: true
  action: 'cutout'
  elapsedMs: number
  attempts: LiveAttempt[]
  bytesRead: number
  width: number
  height: number
  bunit: string | null
  /** Top row first, row-major; null where the pixel is NaN/inf. */
  pixels: (number | null)[]
  finite: number
  min: number | null
  max: number | null
  median: number | null
}

export type LiveErrorCode =
  | 'bad_input'
  | 'upstream_http'
  | 'upstream_timeout'
  | 'upstream_network'
  | 'bad_fits'
  | 'internal'

export interface LiveErrorBody {
  ok: false
  /** null when the request had no valid action. */
  action: 'search' | 'cutout' | null
  elapsedMs: number
  attempts: LiveAttempt[]
  error: { code: LiveErrorCode; message: string; upstreamStatus: number | null }
}

/** One backend call. Never throws for HTTP errors; `body` is null when the reply was not JSON. */
export type LiveCall<T> = {
  httpStatus: number | null
  ms: number
  body: T | LiveErrorBody | null
  networkError: string | null
}

// ── Constants ────────────────────────────────────────────────────────────────
/** Positions are the manifest mean_epoch values (public/data/manifest.json). */
export const LIVE_PRESETS: { id: string; name: string; ra: number; dec: number; band: LiveBand }[] = [
  { id: 'barnards-star', name: "Barnard's Star", ra: 269.4463742, dec: 4.7686831, band: 'D2' },
  { id: 'eps-indi-b', name: 'Epsilon Indi B', ra: 331.0965661, dec: -56.8006429, band: 'D3' },
  { id: 'wise-0855', name: 'WISE J085510.83-071442.5', ra: 133.7601588, dec: -7.2412971, band: 'D6' },
  { id: 'rw-aur', name: 'RW Aurigae', ra: 76.9560878, dec: 30.4011269, band: 'D2' },
  { id: 'r-dra', name: 'R Draconis', ra: 248.167234, dec: 66.7550234, band: 'D2' },
]

/** Six parallel cutouts produced an HTTP 503 from IRSA on 2026-11-15. */
export const CUTOUT_CONCURRENCY = 3
export const DEFAULT_MAX = 8
export const MAX_CAP = 24

const BAND_ORDER: LiveBand[] = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6']

export function liveApiBase(): string {
  return process.env.NEXT_PUBLIC_LIVE_API_BASE || '/api/live/'
}

// ── URLs ─────────────────────────────────────────────────────────────────────
function withQuery(base: string, params: Record<string, string>): string {
  return `${base}${base.includes('?') ? '&' : '?'}${new URLSearchParams(params)}`
}

export function buildSearchUrl(
  base: string,
  q: { ra: number; dec: number; collection: LiveCollection; band: LiveBand; max: number },
): string {
  return withQuery(base, {
    action: 'search',
    ra: String(q.ra),
    dec: String(q.dec),
    collection: q.collection,
    band: q.band,
    max: String(q.max),
  })
}

export function buildCutoutUrl(base: string, ra: number, dec: number, accessUrl: string): string {
  return withQuery(base, { action: 'cutout', ra: String(ra), dec: String(dec), url: accessUrl })
}

// ── Validation ───────────────────────────────────────────────────────────────
// Plain decimal or exponent form only: Number() alone would also accept '0x10' and '' (as 0).
const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i

function parseCoord(text: string, name: string, lo: number, hi: number, hiInclusive: boolean): number | string {
  const t = text.trim()
  if (t === '') return `${name} is required`
  const v = NUMBER_RE.test(t) ? Number(t) : NaN
  if (!Number.isFinite(v)) return `${name} must be a number`
  if (v < lo || v > hi || (v === hi && !hiInclusive)) {
    return `${name} must be in ${hiInclusive ? `[${lo}, ${hi}]` : `[${lo}, ${hi})`}`
  }
  return v + 0 // -0 becomes 0
}

/** Same bounds as the server: ra in [0, 360), dec in [-90, 90]. */
export function validateCoords(
  raText: string,
  decText: string,
): { ok: true; ra: number; dec: number } | { ok: false; message: string } {
  const ra = parseCoord(raText, 'RA', 0, 360, false)
  if (typeof ra === 'string') return { ok: false, message: ra }
  const dec = parseCoord(decText, 'Dec', -90, 90, true)
  if (typeof dec === 'string') return { ok: false, message: dec }
  return { ok: true, ra, dec }
}

// ── Plain-words text ─────────────────────────────────────────────────────────
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`

const STATUS_WORDS: Record<number, string> = {
  502: '502 Bad Gateway',
  503: '503 Service Unavailable (IRSA is busy)',
  504: '504 Gateway Timeout',
}

export function describeFailure(call: LiveCall<unknown>, what: 'search' | 'cutout'): string {
  if (call.networkError !== null) {
    return (
      `Could not reach the live-fetch backend at ${liveApiBase()}. ` +
      'Locally, start: pipeline/objects/.venv/Scripts/python.exe scripts/live_dev_server.py'
    )
  }
  const body = call.body as Partial<LiveErrorBody> | null
  const err = body && body.ok === false ? body.error : undefined
  if (!err) {
    if (call.httpStatus === 404) return 'No live-fetch backend at this address (HTTP 404).'
    if (call.httpStatus !== null && call.httpStatus >= 400) {
      return `The live-fetch backend answered HTTP ${call.httpStatus} without a readable error.`
    }
    return `The live-fetch backend reply was not valid JSON (HTTP ${call.httpStatus ?? 'unknown'}).`
  }
  const elapsedMs = typeof body?.elapsedMs === 'number' ? body.elapsedMs : call.ms
  switch (err.code) {
    case 'bad_input':
      return `Rejected input: ${err.message}`
    case 'bad_fits':
      return `IRSA returned something that is not a FITS image: ${err.message}`
    case 'upstream_timeout':
      return `IRSA did not answer within the time limit (${secs(elapsedMs)}).`
    case 'upstream_network':
      return `The backend could not connect to IRSA (${err.message}).`
    case 'upstream_http': {
      const status = err.upstreamStatus
      const words = status !== null && STATUS_WORDS[status]
      if (!words) return `IRSA's ${what} service returned HTTP ${status ?? 'an error'}.`
      const tries = body?.attempts?.length ?? 1
      const advice = what === 'search' ? 'Try again in a minute or switch collection.' : 'Try again in a minute.'
      return (
        `IRSA's ${what} service returned ${words} on all ${tries} ${tries === 1 ? 'try' : 'tries'} ` +
        `in ${secs(elapsedMs)}. This is IRSA's proxy failing, not your input. ${advice}`
      )
    }
    default:
      return `The live-fetch backend failed: ${err.message}`
  }
}

export function emptyResultMessage(r: LiveSearchOk): string | null {
  if (r.exposures.length > 0) return null
  if (r.totalRows === 0) return `IRSA has no SPHEREx ${r.query.collection.toUpperCase()} images covering this point.`
  if (r.bandRows === 0) {
    const have = BAND_ORDER.filter((b) => r.bandCounts[b] > 0).map((b) => `${b} (${r.bandCounts[b]})`)
    const tail = have.length ? `, but IRSA has: ${have.join(', ')}` : ''
    return `No ${r.query.band} images here${tail}.`
  }
  return 'IRSA returned rows, but none could be used.'
}

export function attemptsToLog(label: string, attempts: LiveAttempt[]): string[] {
  return attempts.map((a, i) => {
    const outcome = a.status === 200 && !a.error ? 'OK' : a.status !== null ? `HTTP ${a.status}` : (a.error ?? 'failed')
    const retried = i < attempts.length - 1 ? ', retried' : ''
    return `${label} attempt ${a.n}: ${outcome} in ${secs(a.ms)}${retried}`
  })
}

// ── Image stretch ────────────────────────────────────────────────────────────
function percentile(sorted: number[], p: number): number {
  const pos = ((sorted.length - 1) * p) / 100
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** 1st and 99.5th percentile over every finite pixel of every frame (numpy-style interpolation). */
export function sharedStretch(frames: (number | null)[][]): { lo: number; hi: number } | null {
  const vals: number[] = []
  for (const f of frames) for (const v of f) if (v !== null && Number.isFinite(v)) vals.push(v)
  if (vals.length === 0) return null
  vals.sort((a, b) => a - b)
  const lo = percentile(vals, 1)
  let hi = percentile(vals, 99.5)
  if (hi <= lo) hi = lo + 1e-6
  return { lo, hi }
}

const ASINH_BETA = 3

/** asinh stretch to RGBA, as asinh_stretch_rgb in api/sky.py. Missing pixels are dark grey. */
export function toRgba(pixels: (number | null)[], lo: number, hi: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length * 4)
  const scale = Math.max(hi - lo, 1e-30)
  const norm = Math.asinh(ASINH_BETA)
  for (let i = 0; i < pixels.length; i++) {
    const v = pixels[i]
    const o = i * 4
    if (v === null || !Number.isFinite(v)) {
      out[o] = 40
      out[o + 1] = 40
      out[o + 2] = 50
    } else {
      const n = Math.min(1, Math.max(0, Math.asinh(((v - lo) / scale) * ASINH_BETA) / norm))
      const g = Math.floor(n * 255)
      out[o] = g
      out[o + 1] = g
      out[o + 2] = g
    }
    out[o + 3] = 255
  }
  return out
}

// ── Pool ─────────────────────────────────────────────────────────────────────
function abortError(): Error {
  const e = new Error('Aborted')
  e.name = 'AbortError'
  return e
}

/**
 * Run fn over items, at most `limit` at a time, and return results in input order.
 * After `signal` aborts no new item starts and the returned promise rejects with an AbortError
 * (items already running are left to finish or to honour the signal themselves).
 * The first rejection from fn rejects the pool and stops further items from starting.
 */
export async function runPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  let failed = false
  const worker = async () => {
    while (!failed && !signal?.aborted && next < items.length) {
      const i = next++
      try {
        results[i] = await fn(items[i], i)
      } catch (e) {
        failed = true
        throw e
      }
    }
  }
  const n = Math.max(1, Math.min(Math.floor(limit) || 1, items.length))
  await Promise.all(Array.from({ length: items.length === 0 ? 0 : n }, worker))
  if (next < items.length) throw abortError()
  return results
}

// ── Network ──────────────────────────────────────────────────────────────────
async function call<T>(url: string, signal?: AbortSignal): Promise<LiveCall<T>> {
  const t0 = performance.now()
  try {
    const res = await fetch(url, { cache: 'no-store', signal })
    const text = await res.text()
    let body: T | LiveErrorBody | null = null
    try {
      body = JSON.parse(text) as T | LiveErrorBody
    } catch {
      body = null // HTML error page from the host, for example
    }
    return { httpStatus: res.status, ms: Math.round(performance.now() - t0), body, networkError: null }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e
    return {
      httpStatus: null,
      ms: Math.round(performance.now() - t0),
      body: null,
      networkError: e instanceof Error ? e.message : String(e),
    }
  }
}

export function liveSearch(
  base: string,
  q: { ra: number; dec: number; collection: LiveCollection; band: LiveBand; max: number },
  signal?: AbortSignal,
): Promise<LiveCall<LiveSearchOk>> {
  return call<LiveSearchOk>(buildSearchUrl(base, q), signal)
}

export function liveCutout(
  base: string,
  ra: number,
  dec: number,
  accessUrl: string,
  signal?: AbortSignal,
): Promise<LiveCall<LiveCutoutOk>> {
  return call<LiveCutoutOk>(buildCutoutUrl(base, ra, dec, accessUrl), signal)
}
