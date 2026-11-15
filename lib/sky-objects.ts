/**
 * Types and loader for public/data/<patch>/objects.json (sky objects overlay).
 * Written by pipeline/objects (mirror: pipeline/objects/schema.py).
 *
 * Erasable TypeScript only (no enums/namespaces) and no value imports, so Node can
 * strip the types and run this file directly (scripts/check-sky-objects.mjs).
 */

export type ObjectKind = 'known' | 'unidentified'
export type MotionBasis = 'catalog' | 'image' | 'none'
export type CatalogName = 'CatWISE2020' | 'AllWISE' | '2MASS' | 'Gaia DR3'
export type MagBand = 'W1' | 'W2' | 'W3' | 'J' | 'H' | 'K' | 'G'
export type ForcedReason = 'bundle target' | 'comparison star'
export interface PixelPos { png_x: number; png_y: number }
export interface CatalogMatch { catalog: CatalogName; id: string; sep_arcsec: number | null; mags: Partial<Record<MagBand, number>> }
export interface ProperMotion { pmra: number | null; pmdec: number | null; total: number; total_err: number | null } // mas/yr, pmra includes cos(dec)
export interface SkyObject {
  id: string                    // "<patch>-NNN", NNN 1-based in output order
  kind: ObjectKind
  moving: boolean
  motion_basis: MotionBasis
  reason: string
  name: string
  catalogs: CatalogMatch[]
  pm_mas_yr: ProperMotion | null
  ra: number; dec: number       // detection (or forced catalog) position at mean epoch, deg
  catalog_ra: number | null; catalog_dec: number | null  // primary catalog position at mean epoch (CatWISE/forced propagated; AllWISE/2MASS as listed)
  snr: number | null            // null when not detected
  detected: boolean
  forced: ForcedReason | null
  image_shift_px: number | null // measured first->last full visit shift, unidentified objects only
  positions: Record<string, PixelPos> // key = every visit id in target.json visits
}
export interface CatalogSnapshot { catalog: CatalogName; table: string; file: string; retrieved: string; rows: number; radius_arcsec: number; service: string }
export interface ObjectThresholds {
  detect_snr: number; min_sep_px: number; edge_margin_px: number; min_frames: number; halo_dilate_px: number
  match_radius_px: number; match_radius_arcsec: number; forced_radius_px: number
  link_radius_arcsec: number; link_radius_max_arcsec: number
  moving_pm_mas_yr: number; moving_pm_min_significance: number
  image_shift_min_px: number; image_shift_min_snr: number; target_absorb_radius_arcsec: number
}
export interface ObjectCounts { detected: number; known: number; unidentified: number; moving: number; forced_undetected: number }
export interface SkyObjectsFile {
  version: 1; patch: string; generated: string; mean_epoch_mjd: number
  detection_frames: string[]    // "D2/v1" labels
  catalog_snapshots: CatalogSnapshot[]; thresholds: ObjectThresholds; counts: ObjectCounts; objects: SkyObject[]
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

/** Shallow runtime guard: version, objects array, and per object a string id, known kind, positions record. */
export function isSkyObjectsFile(x: unknown): x is SkyObjectsFile {
  if (!isRecord(x) || x.version !== 1 || !Array.isArray(x.objects)) return false
  return x.objects.every(
    (o: unknown) =>
      isRecord(o) &&
      typeof o.id === 'string' &&
      (o.kind === 'known' || o.kind === 'unidentified') &&
      isRecord(o.positions),
  )
}

/**
 * Load `/data/<path>` (the manifest's `objects` entry) and validate it.
 * Resolves null (with a console.warn) on a missing path, failed request, bad JSON or
 * wrong shape; never throws. `fetchFn` is injected so this runs outside a browser.
 */
export async function loadSkyObjects(
  path: string | undefined,
  fetchFn: (url: string) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>,
): Promise<SkyObjectsFile | null> {
  if (!path) return null
  const url = `/data/${path}`
  try {
    const r = await fetchFn(url)
    if (!r.ok) throw new Error(`${r.status}`)
    const body: unknown = await r.json()
    if (!isSkyObjectsFile(body)) throw new Error('unexpected objects.json shape')
    return body
  } catch (e) {
    console.warn(`sky objects unavailable (${url}):`, e)
    return null
  }
}
