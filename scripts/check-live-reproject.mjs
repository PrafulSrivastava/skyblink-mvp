// Checks for the live reprojection and coordinate helpers. Run from the repo root:
//   node --experimental-strip-types scripts/check-live-reproject.mjs
import assert from 'node:assert/strict'
import {
  GRID, GRID_CENTER, GRID_SCALE_ARCSEC,
  prepareWcs, pixToSky, skyToPix, toPlane, fromPlane, gridSky, reprojectToGrid,
  subtractBackground, stackGrids, groupVisits, parseRa, parseDec, formatRa, formatDec,
} from '../lib/live-reproject.ts'

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`)
const sepArcsec = (ra1, dec1, ra2, dec2) => {
  const p = toPlane(ra2, dec2, ra1, dec1)
  return Math.hypot(p[0], p[1]) * 3600
}

// ── A real SPHEREx DR1 cutout header (Barnard's Star, D2, exposure 2025W34_2B_0090_4) ──
// Requested centre 269.4463742, 4.7686831; the cutout was 49 × 49 pixels.
const REAL = {
  CTYPE1: 'RA---TAN-SIP', CTYPE2: 'DEC--TAN-SIP',
  CRPIX1: -116.5, CRPIX2: -927.5, CRVAL1: 269.236070549, CRVAL2: 6.40102765807, LONPOLE: 180,
  CDELT1: 1, CDELT2: 1,
  PC1_1: 0.00170227082786, PC1_2: -3.36422975169e-05, PC2_1: -3.44705144342e-05, PC2_2: -0.00170668970143,
  A_ORDER: 3, A_0_0: -0.110309104245, A_0_1: -6.92381509295e-05, A_0_2: -2.75982070052e-08, A_0_3: -9.66014371462e-12,
  A_1_0: 0.000418630318125, A_1_1: 3.95878484025e-06, A_1_2: 5.96312146824e-10, A_2_0: -2.96520819347e-08,
  A_2_1: 1.78898626918e-12, A_3_0: 5.18859144605e-10,
  B_ORDER: 3, B_0_0: -0.893081814522, B_0_1: -2.18574862463e-06, B_0_2: 1.95885001344e-06, B_0_3: 4.90190171632e-10,
  B_1_0: -3.93617207399e-05, B_1_1: 4.39579251204e-08, B_1_2: -2.24635730462e-12, B_2_0: 6.54942093687e-06,
  B_2_1: 6.24806810048e-10, B_3_0: -1.5014443945e-11,
}
const real = prepareWcs(REAL)
assert.ok(real, 'real header prepares')
assert.equal(real.sipA.length, 10)
assert.equal(real.sipB.length, 10)

// Round trip pixel -> sky -> pixel across the cutout
for (const [x, y] of [[1, 1], [25, 25], [49, 1], [1, 49], [49, 49], [12.3, 37.8]]) {
  const [ra, dec] = pixToSky(real, x, y)
  const back = skyToPix(real, ra, dec)
  close(back[0], x, 1e-6, `round trip x at ${x},${y}`)
  close(back[1], y, 1e-6, `round trip y at ${x},${y}`)
}
// The requested centre lands at the middle of the 49-pixel cutout (FITS 25, 25), within a pixel
const mid = skyToPix(real, 269.4463742, 4.7686831)
close(mid[0], 25, 1, 'cutout centre x')
close(mid[1], 25, 1, 'cutout centre y')
// Pixel scale about 6.1″
const [ra1, dec1] = pixToSky(real, 25, 25)
const [ra2, dec2] = pixToSky(real, 26, 25)
close(sepArcsec(ra1, dec1, ra2, dec2), 6.13, 0.05, 'pixel scale')

// Without SIP the same header puts the centre a pixel or so off: the polynomial matters here
const noSip = prepareWcs({ ...REAL, CTYPE1: 'RA---TAN', CTYPE2: 'DEC--TAN' })
const midNoSip = skyToPix(noSip, 269.4463742, 4.7686831)
assert.ok(Math.hypot(midNoSip[0] - mid[0], midNoSip[1] - mid[1]) > 0.5, 'SIP shifts the position')

// Rejections
assert.equal(prepareWcs(null), null)
assert.equal(prepareWcs({ ...REAL, CTYPE1: 'GLON-TAN' }), null)
assert.equal(prepareWcs({ ...REAL, LONPOLE: 0 }), null)
assert.equal(prepareWcs({ ...REAL, PC1_1: 0, PC1_2: 0 }), null, 'singular matrix')
const { CDELT1, CDELT2, ...noScale } = REAL
assert.equal(prepareWcs(noScale), null, 'no CD and no CDELT')

// ── Projection helpers ───────────────────────────────────────────────────────
for (const [ra, dec, ra0, dec0] of [[10, 20, 10.01, 20.02], [359.99, -5, 0.01, -5], [180, 89.9, 0, 89.95]]) {
  const p = toPlane(ra, dec, ra0, dec0)
  const [r, d] = fromPlane(p[0], p[1], ra0, dec0)
  close(sepArcsec(ra, dec, r, d), 0, 1e-6, `plane round trip ${ra},${dec}`)
}
assert.equal(toPlane(0, 0, 180, 0), null, 'far side')

// ── Grid orientation: north up, east left, 6.15″ pixels ──────────────────────
const sky = gridSky(100, 30)
assert.equal(sky.length, GRID * GRID)
const at = (i, j) => sky[j * GRID + i]
close(sepArcsec(100, 30, ...at(GRID_CENTER, GRID_CENTER)), 0, 1e-6, 'centre pixel is the position')
assert.ok(at(GRID_CENTER, 0)[1] > 30, 'top row is north')
assert.ok(at(0, GRID_CENTER)[0] > 100, 'left column is east')
close(sepArcsec(...at(GRID_CENTER, GRID_CENTER), ...at(GRID_CENTER + 1, GRID_CENTER)), GRID_SCALE_ARCSEC, 1e-3, 'grid scale')

// ── Reprojection: a rotated, mirrored detector frame with one star ───────────
// 70 × 70 cutout, 6″ pixels, rotated 35°, y mirrored; star placed 30″ east and 45″ north of the target
const ra0 = 150, dec0 = -20
const th = 35 * Math.PI / 180, s = 6 / 3600
const SYN = {
  CTYPE1: 'RA---TAN', CTYPE2: 'DEC--TAN', CRPIX1: 35.5, CRPIX2: 35.5, CRVAL1: ra0, CRVAL2: dec0,
  CD1_1: -s * Math.cos(th), CD1_2: s * Math.sin(th), CD2_1: s * Math.sin(th), CD2_2: s * Math.cos(th),
}
const syn = prepareWcs(SYN)
const [sRa, sDec] = fromPlane(30 / 3600, 45 / 3600, ra0, dec0)
const [sx, sy] = skyToPix(syn, sRa, sDec)
const W = 70, H = 70
const pixels = []
for (let r = 0; r < H; r++) {
  for (let c = 0; c < W; c++) {
    const x = c + 1, y = H - r // top row first
    pixels.push(r === 3 && c === 3 ? null : 10 + 1000 * Math.exp(-((x - sx) ** 2 + (y - sy) ** 2) / (2 * 1.2 ** 2)))
  }
}
const grid = reprojectToGrid(pixels, W, H, syn, gridSky(ra0, dec0))
assert.equal(grid.length, GRID * GRID)
let best = 0
for (let k = 1; k < grid.length; k++) if ((grid[k] ?? -1) > (grid[best] ?? -1)) best = k
const bi = best % GRID, bj = Math.floor(best / GRID)
// Light-weighted centre in a 7 × 7 box around the peak (background 10 removed)
let fx = 0, fy = 0, f = 0
for (let j = bj - 3; j <= bj + 3; j++) {
  for (let i = bi - 3; i <= bi + 3; i++) {
    const v = (grid[j * GRID + i] ?? 10) - 10
    fx += v * i; fy += v * j; f += v
  }
}
// 30″ east = 4.9 px left of centre, 45″ north = 7.3 px above
close(fx / f, GRID_CENTER - 30 / GRID_SCALE_ARCSEC, 0.25, 'star column')
close(fy / f, GRID_CENTER - 45 / GRID_SCALE_ARCSEC, 0.25, 'star row')
assert.ok(grid.every(v => v === null || Number.isFinite(v)))
// A frame that does not cover the grid gives nulls
const far = reprojectToGrid(pixels, W, H, prepareWcs({ ...SYN, CRVAL1: ra0 + 1 }), gridSky(ra0, dec0))
assert.ok(far.every(v => v === null), 'no overlap -> all null')

// ── Background, stacking, visits ─────────────────────────────────────────────
assert.deepEqual(subtractBackground([1, 2, 3, null, 100]), [-1.5, -0.5, 0.5, null, 97.5])
assert.deepEqual(stackGrids([[1, null, 5], [3, null, 5], [100, 7, null]]), [3, 7, 5])
assert.deepEqual(stackGrids([[1, 2], [3, null]]), [2, 2])
const e = (tMin, date, v) => ({ obsId: date, date, tMin, accessUrl: 'u', grid: [v] })
const visits = groupVisits([
  e(61010, '2026-03-15 00:50', 5), e(60908, '2025-08-21 23:33', 1), e(60912, '2025-08-25 17:08', 3),
  e(61012, '2026-03-17 16:23', 7), e(60914, '2025-08-27 06:39', 2),
])
assert.deepEqual(visits.map(v => [v.id, v.dateStart, v.dateEnd, v.exposures.length, v.grid[0]]), [
  ['v1', '2025-08-21', '2025-08-27', 3, 2],
  ['v2', '2026-03-15', '2026-03-17', 2, 6],
])

// ── Coordinates ──────────────────────────────────────────────────────────────
close(parseRa('269.4463742'), 269.4463742, 1e-12, 'RA degrees')
close(parseRa('17h 57m 48.5s'), 269.45208, 1e-4, 'RA hms')
close(parseRa('17 57 48.5'), 269.45208, 1e-4, 'RA spaces')
close(parseRa('17:57:48.5'), 269.45208, 1e-4, 'RA colons')
close(parseRa('17h57m48.5s'), 269.45208, 1e-4, 'RA packed')
for (const bad of ['', '360', '-1', '25h 00m', '17h 61m', 'abc', '1 2 3 4'])
  assert.equal(typeof parseRa(bad), 'string', `RA "${bad}" rejected`)
close(parseDec('4.6933'), 4.6933, 1e-12, 'Dec degrees')
close(parseDec('+04° 41′ 36″'), 4.69333, 1e-4, 'Dec dms')
close(parseDec('−56 48 02'), -56.80056, 1e-4, 'Dec unicode minus')
close(parseDec('-00 30 00'), -0.5, 1e-12, 'Dec negative zero degrees')
close(parseDec('+04:41:36'), 4.69333, 1e-4, 'Dec colons')
for (const bad of ['', '91', '-90.5', '+04 61 00', 'north', '4 -5'])
  assert.equal(typeof parseDec(bad), 'string', `Dec "${bad}" rejected`)
assert.equal(formatRa(269.4463742), '17h 57m 47.1s')
assert.equal(formatRa(359.99999), '00h 00m 00.0s')
assert.equal(formatDec(4.7686831), '+04° 46′ 07″')
assert.equal(formatDec(-56.8006429), '−56° 48′ 02″')
close(parseRa(formatRa(123.456)), 123.456, 15 * 0.05 / 3600, 'RA format round trip')

console.log('check-live-reproject: all checks passed')
