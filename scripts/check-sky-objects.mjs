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

const obj = (id, kind, moving, snr, positions) => ({
  id, kind, moving, motion_basis: moving ? 'image' : 'none', reason: '', name: id, catalogs: [], pm_mas_yr: null,
  ra: 0, dec: 0, catalog_ra: null, catalog_dec: null, snr, detected: snr !== null, forced: null, image_shift_px: null, positions,
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
