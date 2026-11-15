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
  const absent = await loadSkyObjects(undefined, async () => {
    called = true
    return { ok: true, status: 200, json: async () => good }
  })
  assert.equal(absent, null)
  assert.equal(called, false, 'no fetch when manifest has no objects path')

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
