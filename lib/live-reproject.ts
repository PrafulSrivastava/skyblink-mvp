/**
 * Turns live SPHEREx cutouts into frames the viewer can blink.
 *
 * Each live cutout comes in the detector's own orientation, and different exposures are rotated
 * against each other. Here every cutout is resampled onto the viewer's grid: 49 × 49 pixels of
 * 6.15″, north up and east left, centred on the position the visitor typed. The cutout's own WCS
 * (gnomonic TAN with the forward SIP distortion polynomial) maps grid points back to detector
 * pixels. Exposures are then grouped into visits (SPHEREx passes over a spot about every six
 * months) and stacked, as the prepared objects are.
 *
 * Also: sexagesimal coordinate parsing and formatting for the position form.
 *
 * Erasable TypeScript only, no React and no path aliases, so Node can strip the types and run this
 * file directly (scripts/check-live-reproject.mjs).
 */

// ── Grid (same as the prepared objects and BlinkPlayer) ──────────────────────
export const GRID = 49
export const GRID_CENTER = 24
export const GRID_SCALE_ARCSEC = 6.15

/** WCS keywords from api/live.py (extract_wcs): numbers, except the CTYPEs. */
export interface LiveWcs {
  CTYPE1: string
  CTYPE2: string
  CRPIX1: number
  CRPIX2: number
  CRVAL1: number
  CRVAL2: number
  [key: string]: number | string
}

interface SipTerm {
  p: number
  q: number
  c: number
}

export interface PreparedWcs {
  crpix1: number
  crpix2: number
  /** Reference point, degrees */
  ra0: number
  dec0: number
  /** CD matrix, degrees per pixel: [CD1_1, CD1_2, CD2_1, CD2_2] */
  cd: [number, number, number, number]
  inv: [number, number, number, number]
  sipA: SipTerm[]
  sipB: SipTerm[]
}

const D2R = Math.PI / 180
const R2D = 180 / Math.PI

function num(w: LiveWcs, key: string): number | null {
  const v = w[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function sipTerms(w: LiveWcs, letter: 'A' | 'B'): SipTerm[] {
  const order = num(w, `${letter}_ORDER`)
  if (order === null) return []
  const re = new RegExp(`^${letter}_(\\d+)_(\\d+)$`)
  const out: SipTerm[] = []
  for (const key of Object.keys(w)) {
    const m = re.exec(key)
    const c = num(w, key)
    if (!m || c === null || c === 0) continue
    const p = Number(m[1])
    const q = Number(m[2])
    if (p + q <= order) out.push({ p, q, c })
  }
  return out
}

/** Checks and precomputes a cutout's WCS. Null when it is not a celestial TAN projection we can use. */
export function prepareWcs(w: LiveWcs | null | undefined): PreparedWcs | null {
  if (!w || !String(w.CTYPE1).startsWith('RA---TAN') || !String(w.CTYPE2).startsWith('DEC--TAN')) return null
  const crpix1 = num(w, 'CRPIX1')
  const crpix2 = num(w, 'CRPIX2')
  const ra0 = num(w, 'CRVAL1')
  const dec0 = num(w, 'CRVAL2')
  if (crpix1 === null || crpix2 === null || ra0 === null || dec0 === null) return null
  const lonpole = num(w, 'LONPOLE')
  if (lonpole !== null && lonpole !== 180) return null

  let cd: [number, number, number, number]
  const cd11 = num(w, 'CD1_1'), cd12 = num(w, 'CD1_2'), cd21 = num(w, 'CD2_1'), cd22 = num(w, 'CD2_2')
  if (cd11 !== null && cd12 !== null && cd21 !== null && cd22 !== null) {
    cd = [cd11, cd12, cd21, cd22]
  } else {
    const c1 = num(w, 'CDELT1'), c2 = num(w, 'CDELT2')
    if (c1 === null || c2 === null) return null
    cd = [
      c1 * (num(w, 'PC1_1') ?? 1), c1 * (num(w, 'PC1_2') ?? 0),
      c2 * (num(w, 'PC2_1') ?? 0), c2 * (num(w, 'PC2_2') ?? 1),
    ]
  }
  const det = cd[0] * cd[3] - cd[1] * cd[2]
  if (!Number.isFinite(det) || det === 0) return null
  const inv: [number, number, number, number] = [cd[3] / det, -cd[1] / det, -cd[2] / det, cd[0] / det]

  const sip = String(w.CTYPE1).endsWith('-SIP')
  return {
    crpix1, crpix2, ra0, dec0, cd, inv,
    sipA: sip ? sipTerms(w, 'A') : [],
    sipB: sip ? sipTerms(w, 'B') : [],
  }
}

function poly(terms: SipTerm[], u: number, v: number): number {
  let s = 0
  for (const t of terms) s += t.c * u ** t.p * v ** t.q
  return s
}

// ── Gnomonic (TAN) projection, LONPOLE = 180 ─────────────────────────────────
/** Sky (degrees) to tangent-plane offsets (degrees) about (ra0, dec0). Null on the far hemisphere. */
export function toPlane(ra: number, dec: number, ra0: number, dec0: number): [number, number] | null {
  const a = ra * D2R, d = dec * D2R, a0 = ra0 * D2R, d0 = dec0 * D2R
  const cosC = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a - a0)
  if (cosC <= 1e-9) return null
  const xi = (Math.cos(d) * Math.sin(a - a0)) / cosC
  const eta = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a - a0)) / cosC
  return [xi * R2D, eta * R2D]
}

/** Tangent-plane offsets (degrees) about (ra0, dec0) back to sky (degrees, RA in [0, 360)). */
export function fromPlane(xiDeg: number, etaDeg: number, ra0: number, dec0: number): [number, number] {
  const xi = xiDeg * D2R, eta = etaDeg * D2R, d0 = dec0 * D2R
  const den = Math.cos(d0) - eta * Math.sin(d0)
  const ra = ra0 + Math.atan2(xi, den) * R2D
  const dec = Math.atan2(Math.sin(d0) + eta * Math.cos(d0), Math.hypot(xi, den)) * R2D
  return [((ra % 360) + 360) % 360, dec]
}

/** FITS pixel (1-based) to sky, degrees. */
export function pixToSky(w: PreparedWcs, x: number, y: number): [number, number] {
  const u = x - w.crpix1
  const v = y - w.crpix2
  const uu = u + poly(w.sipA, u, v)
  const vv = v + poly(w.sipB, u, v)
  const X = w.cd[0] * uu + w.cd[1] * vv
  const Y = w.cd[2] * uu + w.cd[3] * vv
  return fromPlane(X, Y, w.ra0, w.dec0)
}

/** Sky (degrees) to FITS pixel (1-based), inverting the SIP polynomial by fixed-point iteration. */
export function skyToPix(w: PreparedWcs, ra: number, dec: number): [number, number] | null {
  const p = toPlane(ra, dec, w.ra0, w.dec0)
  if (!p) return null
  const U = w.inv[0] * p[0] + w.inv[1] * p[1]
  const V = w.inv[2] * p[0] + w.inv[3] * p[1]
  let u = U, v = V
  if (w.sipA.length || w.sipB.length) {
    for (let i = 0; i < 30; i++) {
      const un = U - poly(w.sipA, u, v)
      const vn = V - poly(w.sipB, u, v)
      const done = Math.abs(un - u) + Math.abs(vn - v) < 1e-9
      u = un
      v = vn
      if (done) break
    }
  }
  return [u + w.crpix1, v + w.crpix2]
}

// ── Resampling ───────────────────────────────────────────────────────────────
/** Sky position (degrees) of every grid pixel centre, row 0 = north, column 0 = east. */
export function gridSky(ra0: number, dec0: number): [number, number][] {
  const out: [number, number][] = []
  const s = GRID_SCALE_ARCSEC / 3600
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      out.push(fromPlane((GRID_CENTER - i) * s, (GRID_CENTER - j) * s, ra0, dec0))
    }
  }
  return out
}

/**
 * Resample one cutout (top row first, null = no data) onto the north-up grid with bilinear
 * interpolation. Grid pixels that fall outside the cutout or on missing data are null.
 */
export function reprojectToGrid(
  pixels: (number | null)[],
  width: number,
  height: number,
  w: PreparedWcs,
  sky: [number, number][],
): (number | null)[] {
  const at = (c: number, r: number): number | null =>
    c < 0 || r < 0 || c >= width || r >= height ? null : pixels[r * width + c]
  return sky.map(([ra, dec]) => {
    const xy = skyToPix(w, ra, dec)
    if (!xy) return null
    const col = xy[0] - 1 // FITS x = 1 is the centre of column 0
    const row = height - xy[1] // FITS rows run bottom-up; pixels are top row first
    const c0 = Math.floor(col), r0 = Math.floor(row)
    const fc = col - c0, fr = row - r0
    let sum = 0, weight = 0
    const corners: [number, number, number][] = [
      [c0, r0, (1 - fc) * (1 - fr)], [c0 + 1, r0, fc * (1 - fr)],
      [c0, r0 + 1, (1 - fc) * fr], [c0 + 1, r0 + 1, fc * fr],
    ]
    for (const [c, r, k] of corners) {
      const v = at(c, r)
      if (v !== null && Number.isFinite(v) && k > 0) {
        sum += v * k
        weight += k
      }
    }
    return weight >= 0.5 ? sum / weight : null
  })
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Subtract the median, so exposures with different sky backgrounds stack and blink evenly. */
export function subtractBackground(grid: (number | null)[]): (number | null)[] {
  const vals = grid.filter((v): v is number => v !== null)
  if (vals.length === 0) return grid
  const bg = median(vals)
  return grid.map(v => (v === null ? null : v - bg))
}

/** Per-pixel median of three or more exposures (rejects cosmic-ray hits), mean of fewer. */
export function stackGrids(grids: (number | null)[][]): (number | null)[] {
  if (grids.length === 0) return []
  const n = grids[0].length
  const out: (number | null)[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const vals: number[] = []
    for (const g of grids) {
      const v = g[i]
      if (v !== null && Number.isFinite(v)) vals.push(v)
    }
    out[i] = vals.length === 0 ? null : vals.length >= 3 ? median(vals) : vals.reduce((a, b) => a + b, 0) / vals.length
  }
  return out
}

// ── Visits ───────────────────────────────────────────────────────────────────
export interface LiveExposureGrid {
  obsId: string | null
  /** "YYYY-MM-DD HH:MM" UTC */
  date: string
  /** MJD */
  tMin: number
  accessUrl: string
  grid: (number | null)[]
}

export interface LiveVisit {
  id: string
  /** "YYYY-MM-DD" */
  dateStart: string
  dateEnd: string
  exposures: LiveExposureGrid[]
  grid: (number | null)[]
}

/** Group exposures into visits: a new visit starts after a gap of more than `gapDays`. Then stack each. */
export function groupVisits(exposures: LiveExposureGrid[], gapDays = 20): LiveVisit[] {
  const sorted = [...exposures].sort((a, b) => a.tMin - b.tMin)
  const groups: LiveExposureGrid[][] = []
  for (const e of sorted) {
    const g = groups[groups.length - 1]
    if (g && e.tMin - g[g.length - 1].tMin <= gapDays) g.push(e)
    else groups.push([e])
  }
  return groups.map((g, i) => ({
    id: `v${i + 1}`,
    dateStart: g[0].date.slice(0, 10),
    dateEnd: g[g.length - 1].date.slice(0, 10),
    exposures: g,
    grid: stackGrids(g.map(e => e.grid)),
  }))
}

// ── Coordinates ──────────────────────────────────────────────────────────────
const DECIMAL_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/

function normalise(text: string): string {
  return text.trim().replace(/[−–—]/g, '-').replace(/,/g, '.')
}

function sexagesimalParts(text: string): number[] | null {
  const parts = text.split(/[\s:hHmMsSdD°′″'"]+/).filter(Boolean)
  if (parts.length < 1 || parts.length > 3 || !parts.every(p => DECIMAL_RE.test(p) && !/^[+-]/.test(p))) return null
  return parts.map(Number)
}

/**
 * Right ascension in decimal degrees ("269.4464") or hours, minutes and seconds
 * ("17h 57m 48.5s", "17 57 48.5", "17:57:48.5"). Returns degrees, or an error message.
 */
export function parseRa(input: string): number | string {
  const t = normalise(input)
  if (t === '') return 'Enter a right ascension'
  if (DECIMAL_RE.test(t) && !/[hms:\s]/i.test(t)) {
    const v = Number(t)
    return v >= 0 && v < 360 ? v : 'Right ascension in degrees must be from 0 to 360'
  }
  const p = sexagesimalParts(t)
  if (!p) return 'Use degrees (269.45) or hours, minutes, seconds (17h 57m 48s)'
  const [h, m = 0, s = 0] = p
  if (h >= 24 || m >= 60 || s >= 60) return 'Hours must be under 24, minutes and seconds under 60'
  return (h + m / 60 + s / 3600) * 15
}

/**
 * Declination in decimal degrees ("4.69", "-56.8") or degrees, minutes and seconds
 * ("+04° 41′ 36″", "-56 48 02", "+04:41:36"). Returns degrees, or an error message.
 */
export function parseDec(input: string): number | string {
  const t = normalise(input)
  if (t === '') return 'Enter a declination'
  const sign = t.startsWith('-') ? -1 : 1
  const body = t.replace(/^[+-]\s*/, '')
  if (DECIMAL_RE.test(body) && !/[°′″'":\s]/.test(body)) {
    const v = sign * Number(body)
    return v >= -90 && v <= 90 ? v + 0 : 'Declination must be from −90 to +90 degrees'
  }
  const p = sexagesimalParts(body)
  if (!p) return 'Use degrees (4.69) or degrees, minutes, seconds (+04° 41′ 36″)'
  const [d, m = 0, s = 0] = p
  if (m >= 60 || s >= 60) return 'Minutes and seconds must be under 60'
  const v = sign * (d + m / 60 + s / 3600)
  return v >= -90 && v <= 90 ? v + 0 : 'Declination must be from −90 to +90 degrees'
}

const pad = (n: number, w: number) => String(n).padStart(w, '0')

/** 269.4464 -> "17h 57m 47.1s" */
export function formatRa(deg: number): string {
  let tenths = Math.round((((deg % 360) + 360) % 360) / 15 * 36000)
  tenths %= 24 * 36000
  const h = Math.floor(tenths / 36000)
  const m = Math.floor((tenths % 36000) / 600)
  const s = (tenths % 600) / 10
  return `${pad(h, 2)}h ${pad(m, 2)}m ${s.toFixed(1).padStart(4, '0')}s`
}

/** 4.7687 -> "+04° 46′ 07″" */
export function formatDec(deg: number): string {
  const sign = deg < 0 ? '−' : '+'
  const total = Math.round(Math.abs(deg) * 3600)
  const d = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${sign}${pad(d, 2)}° ${pad(m, 2)}′ ${pad(s, 2)}″`
}
