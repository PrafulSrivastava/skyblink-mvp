/**
 * Sorting, formatting and link-out URLs for the sky-objects list and details panel.
 *
 * Erasable TypeScript only and `import type` only, so Node can strip the types and run
 * this file directly (scripts/check-sky-objects.mjs).
 */
import type { ProperMotion, SkyObject } from './sky-objects'

export type ObjectSortKey = 'snr' | 'kind' | 'name' | 'pm'
export type SortDir = 'asc' | 'desc'

/** Compare two nullable numbers; nulls always last, regardless of direction. */
function cmpNullable(a: number | null | undefined, b: number | null | undefined, dir: SortDir): number {
  const aNull = a === null || a === undefined || Number.isNaN(a)
  const bNull = b === null || b === undefined || Number.isNaN(b)
  if (aNull || bNull) return aNull === bNull ? 0 : aNull ? 1 : -1
  return dir === 'asc' ? a - b : b - a
}

/** New array, stable. snr/pm: nulls last both ways. kind asc = known first, ties by snr desc. */
export function sortObjects(objects: readonly SkyObject[], key: ObjectSortKey, dir: SortDir): SkyObject[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...objects].sort((a, b) => {
    switch (key) {
      case 'snr':
        return cmpNullable(a.snr, b.snr, dir)
      case 'pm':
        return cmpNullable(a.pm_mas_yr?.total, b.pm_mas_yr?.total, dir)
      case 'kind': {
        const rank = (o: SkyObject) => (o.kind === 'known' ? 0 : 1)
        return sign * (rank(a) - rank(b)) || cmpNullable(a.snr, b.snr, 'desc')
      }
      case 'name':
        return sign * (a.name ?? '').localeCompare(b.name ?? '')
    }
  })
}

/** "10393 mas/yr" (rounded integer) or an em dash when there is no proper motion. */
export function formatPm(pm: ProperMotion | null): string {
  const total = pm?.total
  return typeof total === 'number' && Number.isFinite(total) ? `${Math.round(total)} mas/yr` : '—'
}

export function simbadUrl(ra: number, dec: number, radiusArcsec = 10): string {
  const coord = `${ra.toFixed(6)} ${dec >= 0 ? '+' : '-'}${Math.abs(dec).toFixed(6)}`
  return `https://simbad.cds.unistra.fr/simbad/sim-coo?Coord=${encodeURIComponent(coord)}&CooFrame=ICRS&CooEpoch=2000&CooEqui=2000&Radius=${radiusArcsec}&Radius.unit=arcsec`
}

export function irsaUrl(ra: number, dec: number, radiusArcsec = 10): string {
  return `https://irsa.ipac.caltech.edu/cgi-bin/Gator/nph-query?catalog=catwise_2020&spatial=cone&objstr=${encodeURIComponent(`${ra.toFixed(6)} ${dec.toFixed(6)}`)}&radius=${radiusArcsec}&radunits=arcsec&outfmt=1`
}

/**
 * Linear proper-motion propagation of a position from `fromMjd` to `toMjd` (no parallax; `pmra` already
 * includes cos(dec), as in pipeline/objects/geometry.py). Missing or non-finite proper motion or epochs leave the
 * position unchanged. Link-outs use it to ask SIMBAD (J2000) and IRSA CatWISE (MJD 57170) at the epoch they list.
 */
export function linkPosition(
  ra: number,
  dec: number,
  pm: ProperMotion | null,
  fromMjd: number,
  toMjd: number,
): { ra: number; dec: number } {
  const dt = (toMjd - fromMjd) / 365.25
  if (!pm || !Number.isFinite(dt) || !Number.isFinite(pm.pmra ?? NaN) || !Number.isFinite(pm.pmdec ?? NaN)) {
    return { ra, dec }
  }
  const newDec = dec + (pm.pmdec as number) * dt / 3.6e6
  const newRa = ra + (pm.pmra as number) * dt / 3.6e6 / Math.cos((newDec * Math.PI) / 180)
  return { ra: newRa, dec: newDec }
}
