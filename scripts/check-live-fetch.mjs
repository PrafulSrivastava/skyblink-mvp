// Checks for the live-fetch client helpers. Run from the repo root:
//   node --experimental-strip-types scripts/check-live-fetch.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  LIVE_PRESETS, CUTOUT_CONCURRENCY, DEFAULT_MAX, MAX_CAP,
  buildSearchUrl, buildCutoutUrl, validateCoords, describeFailure, emptyResultMessage,
  attemptsToLog, sharedStretch, toRgba, runPool, liveSearch, liveCutout,
} from '../lib/live-fetch.ts'

// ── Presets equal the manifest mean_epoch values ─────────────────────────────
const manifest = JSON.parse(readFileSync(new URL('../public/data/manifest.json', import.meta.url), 'utf8'))
for (const t of manifest.targets) {
  const p = LIVE_PRESETS.find((x) => x.id === t.id)
  assert.ok(p, `${t.id} preset`)
  assert.equal(p.ra, t.mean_epoch.ra_deg)
  assert.equal(p.dec, t.mean_epoch.dec_deg)
  assert.equal(p.band, t.default_band)
}
assert.equal(LIVE_PRESETS.length, 5)
assert.deepEqual([CUTOUT_CONCURRENCY, DEFAULT_MAX, MAX_CAP], [3, 8, 24])

// ── Coordinate validation ────────────────────────────────────────────────────
for (const [ra, dec] of [['360', '0'], ['-1', '0'], ['0', '90.5'], ['0', '-90.1'], ['', '0'], ['0', '  '],
                         ['12abc', '0'], ['NaN', '0'], ['Infinity', '0'], ['0x10', '0'], ['1', 'abc']])
  assert.equal(validateCoords(ra, dec).ok, false, `${ra},${dec} rejected`)
assert.deepEqual(validateCoords(' 359.5 ', '-90'), { ok: true, ra: 359.5, dec: -90 })
assert.deepEqual(validateCoords('0', '90'), { ok: true, ra: 0, dec: 90 })
assert.ok(Object.is(validateCoords('-0', '0').ra, 0), '-0 normalised to 0')

// ── URLs ─────────────────────────────────────────────────────────────────────
const s = new URL(buildSearchUrl('http://127.0.0.1:8787/api/live/', { ra: 1.5, dec: -2, collection: 'qr3', band: 'D2', max: 8 }))
assert.equal(s.pathname, '/api/live/')
assert.equal(s.searchParams.get('action'), 'search')
assert.equal(s.searchParams.get('collection'), 'qr3')
assert.equal(s.searchParams.get('band'), 'D2')
assert.equal(s.searchParams.get('ra'), '1.5')
assert.equal(s.searchParams.get('dec'), '-2')
assert.equal(s.searchParams.get('max'), '8')
const acc = 'https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/a/b.fits'
const c = new URL(buildCutoutUrl('/api/live/', 1, 2, acc), 'http://x')
assert.equal(c.pathname, '/api/live/')
assert.equal(c.searchParams.get('url'), acc)
assert.equal(c.searchParams.get('action'), 'cutout')
assert.equal(c.searchParams.get('ra'), '1')
assert.equal(c.searchParams.get('dec'), '2')

// ── Failures in plain words ──────────────────────────────────────────────────
const storm = {
  httpStatus: 502, ms: 9800, networkError: null,
  body: { ok: false, action: 'search', elapsedMs: 9800, attempts: Array(6).fill({ n: 1, status: 502, ms: 900, error: 'HTTP 502' }),
          error: { code: 'upstream_http', message: 'HTTP 502', upstreamStatus: 502 } },
}
assert.match(describeFailure(storm, 'search'), /502 Bad Gateway on all 6 tries in 9\.8 s/)
assert.match(describeFailure(storm, 'search'), /not your input/)
const busy = structuredClone(storm)
busy.body.error.upstreamStatus = 503
assert.match(describeFailure(busy, 'search'), /503 Service Unavailable \(IRSA is busy\) on all 6 tries in 9\.8 s/)
const slow = { httpStatus: 504, ms: 52000, networkError: null,
  body: { ok: false, action: 'search', elapsedMs: 52300, attempts: [], error: { code: 'upstream_timeout', message: 'timed out', upstreamStatus: null } } }
assert.equal(describeFailure(slow, 'search'), 'IRSA did not answer within the time limit (52.3 s).')
const bad = { httpStatus: 400, ms: 3, networkError: null,
  body: { ok: false, action: 'search', elapsedMs: 0, attempts: [], error: { code: 'bad_input', message: 'dec out of range [-90, 90]', upstreamStatus: null } } }
assert.equal(describeFailure(bad, 'search'), 'Rejected input: dec out of range [-90, 90]')
const notFits = { httpStatus: 502, ms: 3, networkError: null,
  body: { ok: false, action: 'cutout', elapsedMs: 5, attempts: [], error: { code: 'bad_fits', message: 'oops <html>', upstreamStatus: null } } }
assert.equal(describeFailure(notFits, 'cutout'), 'IRSA returned something that is not a FITS image: oops <html>')
const noNet = { httpStatus: null, ms: 3, body: null, networkError: 'Failed to fetch' }
assert.match(describeFailure(noNet, 'search'), /live_dev_server\.py/)
assert.match(describeFailure(noNet, 'search'), /Could not reach the live-fetch backend at \/api\/live\//)
assert.match(describeFailure({ httpStatus: 404, ms: 3, body: null, networkError: null }, 'search'), /No live-fetch backend at this address \(HTTP 404\)/)
assert.match(describeFailure({ httpStatus: 200, ms: 3, body: null, networkError: null }, 'cutout'), /not valid JSON/)
assert.equal(typeof describeFailure({ httpStatus: 500, ms: 3, networkError: null,
  body: { ok: false, action: null, elapsedMs: 0, attempts: [], error: { code: 'internal', message: 'internal error', upstreamStatus: null } } }, 'search'), 'string')

// ── Empty results ────────────────────────────────────────────────────────────
const base = { ok: true, action: 'search', query: { ra: 0, dec: 0, collection: 'dr1', band: 'D6', max: 8 }, elapsedMs: 1, attempts: [], truncated: false, exposures: [] }
assert.equal(emptyResultMessage({ ...base, totalRows: 0, bandRows: 0, bandCounts: { D1: 0, D2: 0, D3: 0, D4: 0, D5: 0, D6: 0 } }),
  'IRSA has no SPHEREx DR1 images covering this point.')
assert.equal(emptyResultMessage({ ...base, totalRows: 48, bandRows: 0, bandCounts: { D1: 0, D2: 24, D3: 0, D4: 0, D5: 24, D6: 0 } }),
  'No D6 images here, but IRSA has: D2 (24), D5 (24).')
assert.equal(emptyResultMessage({ ...base, query: { ...base.query, collection: 'qr3' }, totalRows: 0, bandRows: 0,
  bandCounts: { D1: 0, D2: 0, D3: 0, D4: 0, D5: 0, D6: 0 } }), 'IRSA has no SPHEREx QR3 images covering this point.')
assert.equal(emptyResultMessage({ ...base, totalRows: 3, bandRows: 1, bandCounts: { D1: 0, D2: 0, D3: 0, D4: 0, D5: 0, D6: 1 },
  exposures: [{ obsId: 'x', band: 'D6', collection: 'dr1', tMin: 1, date: 'd', accessUrl: acc, estSizeKb: 1 }] }), null)

// ── Log lines ────────────────────────────────────────────────────────────────
assert.deepEqual(attemptsToLog('search', [{ n: 1, status: 502, ms: 912, error: 'HTTP 502' }, { n: 2, status: 200, ms: 21480, error: null }]),
  ['search attempt 1: HTTP 502 in 0.9 s, retried', 'search attempt 2: OK in 21.5 s'])
assert.deepEqual(attemptsToLog('cutout 3', [{ n: 1, status: null, ms: 20000, error: 'timed out' }]),
  ['cutout 3 attempt 1: timed out in 20.0 s'])
assert.deepEqual(attemptsToLog('search', []), [])

// ── Stretch ──────────────────────────────────────────────────────────────────
assert.equal(sharedStretch([[null, null], [null]]), null)
assert.equal(sharedStretch([]), null)
const st = sharedStretch([[1, 2, null], [3, 4]])
assert.ok(st && st.lo < st.hi)
assert.ok(st.lo >= 1 && st.hi <= 4)
assert.ok(sharedStretch([[5, 5, 5]]).hi > 5)
const ramp = Array.from({ length: 1001 }, (_, i) => i) // 0..1000
const rs = sharedStretch([ramp, [null, NaN]])
assert.equal(rs.lo, 10) // 1st percentile, linear interpolation like numpy
assert.equal(rs.hi, 995) // 99.5th percentile
const rgba = toRgba([null, 0, 10], 0, 10)
assert.equal(rgba.length, 12)
assert.deepEqual([...rgba.slice(0, 4)], [40, 40, 50, 255])
assert.equal(rgba[4], 0)
assert.equal(rgba[8], 255)
assert.deepEqual([...rgba.slice(4, 8)], [0, 0, 0, 255])
assert.deepEqual([...toRgba([-5, 99], 0, 10)], [0, 0, 0, 255, 255, 255, 255, 255]) // clipped
// truncated like numpy astype(uint8)
assert.equal(toRgba([5], 0, 10)[0], Math.floor((Math.asinh(1.5) / Math.asinh(3)) * 255))

// ── Pool keeps order, limits concurrency, honours abort ──────────────────────
let live = 0
let peak = 0
const out = await runPool([30, 10, 20, 5, 1], 3, async (ms, i) => {
  live++
  peak = Math.max(peak, live)
  await new Promise((r) => setTimeout(r, ms))
  live--
  return i
})
assert.deepEqual(out, [0, 1, 2, 3, 4])
assert.equal(peak, 3)
const ac = new AbortController()
let started = 0
const aborted = await runPool([1, 2, 3, 4, 5, 6], 2, async () => { started++; ac.abort() }, ac.signal).then(() => null, (e) => e)
assert.ok(started <= 2, 'no new items after abort')
assert.equal(aborted?.name, 'AbortError')
assert.deepEqual(await runPool([], 3, async () => 1), [])
await assert.rejects(runPool([1, 2, 3], 1, async (x) => { if (x === 2) throw new Error('boom'); return x }), /boom/)

// ── liveSearch / liveCutout with a stubbed fetch ─────────────────────────────
const q = { ra: 1, dec: 2, collection: 'dr1', band: 'D1', max: 8 }
const realFetch = globalThis.fetch
try {
  let seen
  globalThis.fetch = async (url, init) => {
    seen = { url, init }
    return new Response(JSON.stringify({ ok: true, action: 'search' }), { status: 200 })
  }
  const okCall = await liveSearch('/api/live/', q)
  assert.equal(okCall.httpStatus, 200)
  assert.equal(okCall.networkError, null)
  assert.equal(okCall.body.ok, true)
  assert.equal(seen.init.cache, 'no-store')
  assert.ok(okCall.ms >= 0)
  assert.match(seen.url, /action=search/)

  globalThis.fetch = async () => new Response('<html>Not Found</html>', { status: 404 })
  const html = await liveCutout('/api/live/', 1, 2, acc)
  assert.deepEqual([html.httpStatus, html.body, html.networkError], [404, null, null])

  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, action: 'cutout', elapsedMs: 1, attempts: [],
    error: { code: 'bad_fits', message: 'm', upstreamStatus: null } }), { status: 502 })
  const err502 = await liveCutout('/api/live/', 1, 2, acc)
  assert.equal(err502.httpStatus, 502)
  assert.equal(err502.body.error.code, 'bad_fits')

  globalThis.fetch = async () => { throw new TypeError('Failed to fetch') }
  const net = await liveSearch('/api/live/', q)
  assert.deepEqual([net.httpStatus, net.body, net.networkError], [null, null, 'Failed to fetch'])

  globalThis.fetch = async () => { throw new DOMException('aborted', 'AbortError') }
  await assert.rejects(liveSearch('/api/live/', q), { name: 'AbortError' })
} finally {
  globalThis.fetch = realFetch
}

console.log('check-live-fetch: all checks passed')
