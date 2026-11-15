// Checks for the sky-objects viewer code. Run from the repo root:
//   node --experimental-strip-types scripts/check-sky-objects.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isSkyObjectsFile, loadSkyObjects } from '../lib/sky-objects.ts'

const dataPath = (rel) => fileURLToPath(new URL(`../public/data/${rel}`, import.meta.url))
const readJson = (rel) => JSON.parse(readFileSync(dataPath(rel), 'utf8'))

const manifest = readJson('manifest.json')
const PATCHES = ['barnards-star', 'eps-indi-b', 'wise-0855', 'rw-aur', 'r-dra']

// ── Real generated files ─────────────────────────────────────────────────────
const real = {}
for (const patch of PATCHES) {
  const entry = manifest.targets.find((t) => t.id === patch)
  assert.ok(entry, `${patch} missing from manifest`)
  assert.equal(entry.objects, `${patch}/objects.json`, `${patch} manifest objects path`)

  const file = readJson(entry.objects)
  const target = readJson(entry.target)
  real[patch] = file
  assert.ok(isSkyObjectsFile(file), `${patch}: isSkyObjectsFile`)
  assert.equal(file.patch, patch)

  const visitIds = target.visits.map((v) => v.id).sort()
  assert.ok(file.objects.length > 0, `${patch}: has objects`)
  file.objects.forEach((o, i) => {
    assert.equal(o.id, `${patch}-${String(i + 1).padStart(3, '0')}`, `${patch}: id order`)
    assert.deepEqual(Object.keys(o.positions).sort(), visitIds, `${o.id}: positions keys equal target visit ids`)
  })
}

// Facts the viewer relies on
const saturated = ['barnards-star', 'rw-aur', 'r-dra']
for (const patch of saturated) {
  const t = real[patch].objects.find((o) => o.forced === 'bundle target')
  assert.ok(t, `${patch}: forced bundle target present`)
  assert.equal(t.detected, false, `${patch}: saturated target not detected`)
  assert.equal(t.snr, null, `${patch}: saturated target snr null`)
  assert.equal(t.undetected_note, 'core masked', `${patch}: saturated target reads "core masked"`)
}
{
  // WISE 0855: invisible in the detection stack, not masked; sits at its predicted position, no field star's S/N
  const target = readJson(manifest.targets.find((t) => t.id === 'wise-0855').target)
  const t = real['wise-0855'].objects.find((o) => o.forced === 'bundle target')
  assert.equal(t.detected, false, 'wise-0855: target not detected')
  assert.equal(t.snr, null)
  assert.equal(t.undetected_note, 'no detection above the S/N threshold in the frame stack')
  for (const v of target.visits) {
    assert.deepEqual(t.positions[v.id], { png_x: v.target_px.png_x, png_y: v.target_px.png_y }, `wise-0855: ${v.id} at target_px`)
  }
  // the static CatWISE field star near the target is its own known object
  const star = real['wise-0855'].objects.find((o) => o.catalogs.some((c) => c.id === 'J085501.95-071428.2'))
  assert.ok(star && star.kind === 'known' && star.detected && !star.moving, 'wise-0855: field star is a known static object')
}
for (const patch of PATCHES) {
  for (const o of real[patch].objects) {
    assert.ok(o.undetected_note === null || typeof o.undetected_note === 'string', `${o.id}: undetected_note is null or a string`)
    assert.equal(o.undetected_note !== null, !o.detected, `${o.id}: undetected_note is set exactly when not detected`)
  }
}
assert.ok(real['r-dra'].objects.length > 0, 'r-dra: objects.json is normal despite empty CatWISE snapshot')

// ── Negative cases for the guard ─────────────────────────────────────────────
const clone = (x) => structuredClone(x)
const good = clone(real['eps-indi-b'])
assert.ok(isSkyObjectsFile(good))
const withObject0 = (patch) => {
  const f = clone(good)
  Object.assign(f.objects[0], patch)
  return f
}

assert.equal(isSkyObjectsFile(null), false, 'null')
assert.equal(isSkyObjectsFile('objects'), false, 'string')
assert.equal(isSkyObjectsFile([]), false, 'array')
assert.equal(isSkyObjectsFile({ ...good, version: 2 }), false, 'wrong version')
assert.equal(isSkyObjectsFile({ ...good, version: '1' }), false, 'version as string')
{
  const f = clone(good)
  delete f.objects
  assert.equal(isSkyObjectsFile(f), false, 'missing objects')
}
assert.equal(isSkyObjectsFile({ ...good, objects: {} }), false, 'objects not an array')
assert.equal(isSkyObjectsFile({ ...good, objects: [null] }), false, 'null object entry')
assert.equal(isSkyObjectsFile(withObject0({ kind: 'galaxy' })), false, 'unknown kind')
assert.equal(isSkyObjectsFile(withObject0({ id: 7 })), false, 'non-string id')
assert.equal(isSkyObjectsFile(withObject0({ positions: 'nope' })), false, 'positions is a string')
assert.equal(isSkyObjectsFile(withObject0({ positions: null })), false, 'positions is null')
assert.equal(isSkyObjectsFile(withObject0({ positions: [] })), false, 'positions is an array')
// an empty objects list is a valid file (nothing detected is not an error)
assert.ok(isSkyObjectsFile({ ...good, objects: [] }), 'empty objects list is valid')

// ── loadSkyObjects: never throws, null on any failure ────────────────────────
const okResponse = (body) => async () => ({ ok: true, status: 200, json: async () => body })
const warnings = []
const origWarn = console.warn
console.warn = (...a) => warnings.push(a.join(' '))
try {
  const requested = []
  const got = await loadSkyObjects('eps-indi-b/objects.json', async (url) => {
    requested.push(url)
    return { ok: true, status: 200, json: async () => good }
  })
  assert.deepEqual(requested, ['/data/eps-indi-b/objects.json'])
  assert.deepEqual(got, good)
  assert.equal(warnings.length, 0, 'no warning on success')

  // absent manifest path: null, no fetch
  let called = false
  for (const missing of [undefined, '']) {
    warnings.length = 0
    const absent = await loadSkyObjects(missing, async () => {
      called = true
      return { ok: true, status: 200, json: async () => good }
    })
    assert.equal(absent, null)
    assert.equal(called, false, 'no fetch when manifest has no objects path')
    assert.equal(warnings.length, 1, `missing path (${JSON.stringify(missing)}): exactly one console.warn`)
  }

  const bad = [
    ['404', async () => ({ ok: false, status: 404, json: async () => ({}) })],
    ['json error', async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json') } })],
    ['network error', async () => { throw new TypeError('network down') }],
    ['invalid shape', okResponse({ ...good, version: 2 })],
    ['not an object', okResponse(null)],
  ]
  for (const [label, fetchFn] of bad) {
    warnings.length = 0
    assert.equal(await loadSkyObjects('eps-indi-b/objects.json', fetchFn), null, `${label}: null`)
    assert.equal(warnings.length, 1, `${label}: exactly one console.warn`)
  }
} finally {
  console.warn = origWarn
}

console.log('ok sky-objects')

// ── Overlay geometry, hit test, selection ────────────────────────────────────
import { imageToCanvas, canvasToImage, clientToCanvas, markerGeometry, hitTest, MARKER_STYLE } from '../lib/object-overlay.ts'

const obj = (id, kind, moving, snr, positions, pm = null) => ({
  id, kind, moving, motion_basis: moving ? 'image' : 'none', reason: '', name: id, catalogs: [], pm_mas_yr: pm === null ? null : { pmra: null, pmdec: null, total: pm, total_err: null },
  ra: 0, dec: 0, catalog_ra: null, catalog_dec: null, snr, detected: snr !== null, forced: null, image_shift_px: null, positions, undetected_note: null,
})

assert.deepEqual(imageToCanvas({ png_x: 0, png_y: 0 }, 6), { x: 3, y: 3 })
assert.deepEqual(imageToCanvas({ png_x: 48, png_y: 48 }, 6), { x: 291, y: 291 })
assert.deepEqual(canvasToImage(3, 291, 6), { png_x: 0, png_y: 48 })
// clientToCanvas half-size: canvas 294 drawn at 147 css px
assert.deepEqual(clientToCanvas(100 + 73.5, 50 + 73.5, { left: 100, top: 50, width: 147, height: 147 }, 294, 294), { x: 147, y: 147 })
const A = obj('A', 'known', false, 30, { v1: { png_x: 10, png_y: 10 } })
const B = obj('B', 'unidentified', true, 5, { v1: { png_x: 11, png_y: 10 }, v2: { png_x: 11, png_y: 10 } })
assert.equal(hitTest([A, B], 'v1', 63, 63, 6), 'A')
assert.equal(hitTest([A, B], 'v1', 68, 63, 6), 'B')
assert.equal(hitTest([A, B], 'v1', 63, 90, 6), null)
assert.equal(hitTest([A], 'v2', 63, 63, 6), null)          // no position for v2
const A2 = obj('A2', 'known', false, 99, { v1: { png_x: 10, png_y: 10 } })
assert.equal(hitTest([A, A2], 'v1', 63, 63, 6), 'A2')      // tie -> higher snr
assert.equal(markerGeometry(A, 'v2', 6, null), null)       // markerGeometry missing visit
const gB = markerGeometry(B, 'v1', 6, 'B')
assert.equal(gB.color, MARKER_STYLE.unidentified); assert.equal(gB.movingRingR, 10); assert.equal(gB.selected, true)
assert.equal(markerGeometry(A, 'v1', 6, null).movingRingR, null)
console.log('ok overlay')

// ── Objects list: sorting, formatting, link-out URLs ─────────────────────────
import { sortObjects, formatPm, simbadUrl, irsaUrl } from '../lib/object-list.ts'
const X = obj('X', 'known', false, 30, {}, 500), Y = obj('Y', 'unidentified', false, null, {}, null), Z = obj('Z', 'known', true, 50, {}, 2000)
assert.deepEqual(sortObjects([X, Y, Z], 'snr', 'desc').map(o => o.id), ['Z', 'X', 'Y'])
assert.deepEqual(sortObjects([X, Y, Z], 'snr', 'asc').map(o => o.id), ['X', 'Z', 'Y'])
assert.deepEqual(sortObjects([X, Y, Z], 'pm', 'asc').map(o => o.id), ['X', 'Z', 'Y'])
assert.deepEqual(sortObjects([Y, X, Z], 'kind', 'asc').map(o => o.id), ['Z', 'X', 'Y'])
assert.equal(formatPm(null), '—')
assert.equal(simbadUrl(269.4463742, 4.7686831), 'https://simbad.cds.unistra.fr/simbad/sim-coo?Coord=269.446374%20%2B4.768683&CooFrame=ICRS&CooEpoch=2000&CooEqui=2000&Radius=10&Radius.unit=arcsec')
assert.ok(simbadUrl(133.76, -7.24).includes('Coord=133.760000%20-7.240000'))
assert.equal(irsaUrl(269.4463742, 4.7686831), 'https://irsa.ipac.caltech.edu/cgi-bin/Gator/nph-query?catalog=catwise_2020&spatial=cone&objstr=269.446374%204.768683&radius=10&radunits=arcsec&outfmt=1')
console.log('ok list')

// ── Link-out positions: propagated to the epoch the target service expects ────
import { linkPosition } from '../lib/object-list.ts'
const J2000_MJD = 51544.5, CATWISE_MJD = 57170
const ARCSEC_DEG = 1 / 3600
{
  // Barnard's Star: mean epoch MJD 61102 -> J2000 is dt = (51544.5 - 61102) / 365.25 = -26.167008 yr.
  //   dec: 10362 mas/yr * -26.167008 yr = -271.1457 arcsec;  ra*cos(dec): -801.55 mas/yr * -26.167008 yr = +20.974 arcsec.
  const ra0 = 269.4463742, dec0 = 4.7686831
  const pm = { pmra: -801.55, pmdec: 10362, total: 10393.1, total_err: null }
  const p = linkPosition(ra0, dec0, pm, 61102, J2000_MJD)
  assert.ok(Math.abs((p.dec - dec0) / ARCSEC_DEG + 271.1457) < 0.01, `Barnard dec shift ${(p.dec - dec0) / ARCSEC_DEG}`)
  assert.ok(Math.abs((p.ra - ra0) * Math.cos((p.dec * Math.PI) / 180) / ARCSEC_DEG - 20.974) < 0.01, 'Barnard ra shift uses cos(dec)')
  // and to the CatWISE epoch: dt = (57170 - 61102) / 365.25 = -10.76564 yr -> dec shift -111.557 arcsec
  const c = linkPosition(ra0, dec0, pm, 61102, CATWISE_MJD)
  assert.ok(Math.abs((c.dec - dec0) / ARCSEC_DEG + 111.557) < 0.01, `Barnard CatWISE dec shift ${(c.dec - dec0) / ARCSEC_DEG}`)
  // ra shift is divided by cos(dec): 60 deg, 1000 mas/yr over 10 yr = 10 arcsec on the sky = 20 arcsec of RA
  const q = linkPosition(100, 60, { pmra: 1000, pmdec: 0, total: 1000, total_err: null }, 60000, 60000 + 3652.5)
  assert.ok(Math.abs((q.ra - 100) / ARCSEC_DEG - 20) < 1e-6 && q.dec === 60, 'ra uses cos(dec)')
  // zero, null and NaN proper motion, and a zero baseline, leave the position unchanged
  assert.deepEqual(linkPosition(ra0, dec0, { pmra: 0, pmdec: 0, total: 0, total_err: null }, 61102, J2000_MJD), { ra: ra0, dec: dec0 })
  assert.deepEqual(linkPosition(ra0, dec0, null, 61102, J2000_MJD), { ra: ra0, dec: dec0 })
  assert.deepEqual(linkPosition(ra0, dec0, { pmra: null, pmdec: null, total: 2, total_err: null }, 61102, J2000_MJD), { ra: ra0, dec: dec0 })
  assert.deepEqual(linkPosition(ra0, dec0, { pmra: NaN, pmdec: 5000, total: 5000, total_err: null }, 61102, J2000_MJD), { ra: ra0, dec: dec0 })
  assert.deepEqual(linkPosition(ra0, dec0, pm, 61102, 61102), { ra: ra0, dec: dec0 })
  assert.deepEqual(linkPosition(ra0, dec0, pm, NaN, J2000_MJD), { ra: ra0, dec: dec0 })
}
console.log('ok link positions')
