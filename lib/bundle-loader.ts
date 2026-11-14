/**
 * Loader for the real SPHEREx precomputed bundle in public/data/.
 * Schema: public/data/SCHEMA.md
 * Top-level: public/data/manifest.json
 * Per target: public/data/<id>/target.json + spectrum.json
 *
 * Bundle target IDs: barnards-star | eps-indi-b | wise-0855 | rw-aur | r-dra
 */

export const BUNDLE_TARGET_IDS = [
  'barnards-star',
  'eps-indi-b',
  'wise-0855',
  'rw-aur',
  'r-dra',
] as const

export type BundleTargetId = (typeof BUNDLE_TARGET_IDS)[number]

export function isBundleTarget(id: string | null | undefined): id is BundleTargetId {
  return BUNDLE_TARGET_IDS.includes(id as BundleTargetId)
}

/** Display metadata used in chips and titles */
export const TARGET_DISPLAY: Record<BundleTargetId, { label: string; hint: string }> = {
  'barnards-star': { label: "Barnard's Star", hint: "10\"/yr, fastest-moving star" },
  'eps-indi-b':    { label: 'ε Indi B',       hint: 'T-dwarf, 3.3 µm CH₄ spectrum' },
  'wise-0855':     { label: 'WISE 0855',       hint: 'Coldest BD, D6 only, 125.7″ stale coord' },
  'rw-aur':        { label: 'RW Aur',          hint: 'T Tauri variable' },
  'r-dra':         { label: 'R Dra',           hint: 'Mira variable, fully saturated' },
}

// ── Types matching public/data/SCHEMA.md ──────────────────────────────────────

export interface BundleManifestEntry {
  id: BundleTargetId
  name: string
  default_band: string
  target: string
  spectrum: string
  visits: string[]
  full_visits: string[]
  bands: string[]
  default_frames: Record<string, string>
  default_diff: string | null
  mean_epoch: { mjd: number; date: string; ra_deg: number; dec_deg: number }
  input_offset_arcsec: number
}

export interface BundleManifest {
  version: number
  generated: string
  grid_pixel_scale_arcsec: number
  grid_naxis: number
  flux_unit: string
  image_unit: string
  targets: BundleManifestEntry[]
  citation: string
  schema: string
}

export interface BundleGrid {
  NAXIS1: number; NAXIS2: number
  CTYPE1: string; CTYPE2: string
  CRVAL1: number; CRVAL2: number
  CDELT1: number; CDELT2: number
  CRPIX1: number; CRPIX2: number
  CUNIT1: string; CUNIT2: string
  RADESYS: string
  pixel_scale_arcsec: number
  orientation: string
}

export interface BundleTargetPx {
  x: number; y: number          // 0-based FITS coords
  png_x: number; png_y: number  // 0-based image coords (row 0 = north)
}

export interface BundleVisit {
  id: string
  mjd_mean: number; mjd_min: number; mjd_max: number
  date_start: string; date_end: string
  n_images: number
  n_images_per_band: Record<string, number>
  bands_present: string[]
  full: boolean
  target_radec: [number, number]
  target_px: BundleTargetPx
  n_coadded: Record<string, number>
}

export interface BundleComparisonStar {
  gaia_dr3_source_id: string
  ra: number; dec: number; G: number
  pm_total_mas_yr: number
  x: number; y: number; png_x: number; png_y: number
  selection: string
}

export interface BundleStretchParams {
  type: 'asinh'
  lo: number; hi: number; a: number; unit: string
  diff?: {
    type: 'asinh_diverging'
    scale: number; a: number; mid: number
    pair: [string, string]; definition: string
  }
}

export interface BundleMotionCheck {
  pair: [string, string]
  predicted_dx_px: number; predicted_dy_px: number; predicted_shift_px: number
  per_band: Record<string, {
    fit_A: { x: number; y: number; sigma: number; amp: number; ex: number; ey: number; npix: number; n_masked_in_r: number }
    fit_B: { x: number; y: number; sigma: number; amp: number; ex: number; ey: number; npix: number; n_masked_in_r: number }
    measured_dx_px: number; measured_dy_px: number; measured_shift_px: number
    offset_from_pred_A_px: number; offset_from_pred_B_px: number
    comparison_shift_px?: number
  }>
}

export interface BundleTarget {
  id: string; name: string
  input: {
    coord: string; source: string
    ra_deg: number; dec_deg: number
    offset_from_mean_epoch_position_arcsec: number
    offset_from_mean_epoch_position_px: number
  }
  catalog: {
    catalog: string; source_id: string
    ra: number; dec: number
    pmra: number; pmdec: number
    pmra_err?: number; pmdec_err?: number
    parallax: number | null; parallax_err?: number
    rv: number | null; G?: number; W1?: number; W2?: number
    ref_epoch: string; ref_epoch_mjd: number
  }
  proper_motion_source: string
  default_band: string
  mean_epoch: { mjd: number; date: string; ra_deg: number; dec_deg: number }
  grid: BundleGrid
  visits: BundleVisit[]
  comparison_star: BundleComparisonStar | null
  stretch: Record<string, BundleStretchParams>
  paths: Record<string, Record<string, { png: string; f32: string; mask: string } | string>>
  full_visits: string[]
  photometry: { aperture_radius_px: number; annulus_px: [number, number]; flux_unit: string }
  checks: {
    motion_first_last_full_visit?: BundleMotionCheck
    coadd_forced_aperture?: Record<string, { sn: number | null; note?: string; sum_MJy_sr_px?: number; noise?: number }>
    masked_core_area_px_within_6px?: { note: string; values: Record<string, Record<string, number>> }
    variability_same_channel?: Record<string, { n_channels_compared: number; median_dmag: number | null; max_abs_dmag: number | null; n_channels_gt5sigma: number }>
    ch4_3p3um_dip?: { flux_3p03: number; flux_3p29: number; flux_4p00: number; ratio_3p29_to_mean_3p03_4p00: number; ratio_3p29_to_3p03: number }
    default_band_weighted_mean_flux?: { band: string; n: number; flux_uJy: number; err_uJy: number; sn: number; per_visit: Record<string, { n: number; flux_uJy: number; err_uJy: number }> }
    psf_wing_ratio_first_last_full?: { pair: [string, string]; values: Record<string, { n_pix: number; wing_sum_A: number; wing_sum_B: number; ratio_B_over_A: number; dmag: number }> }
  }
  notes: string[]
  citation: string
}

export interface BundleSpectrumPoint {
  wavelength_um: number; bandwidth_um: number
  flux: number | null; flux_err: number | null
  mjd: number; detector: string; visit: string; channel: number
  flagged: boolean; saturated: boolean
  obs_id: string; x_native: number; y_native: number
  ap_corr: number; pix_area_arcsec2: number
}

export interface BundleSpectrumBinned {
  channel: number; wavelength_um: number; wavelength_mean_um: number | null
  flux: number | null; flux_err: number | null
  n: number; n_saturated: number; n_flagged: number; n_total: number
}

export interface BundleSpectrum {
  flux_unit: string; wavelength_unit: string
  method: string; saturated_definition: string; flagged_definition: string
  points: BundleSpectrumPoint[]
  binned: BundleSpectrumBinned[]
  binned_by_visit: Record<string, BundleSpectrumBinned[]>
}

// ── Fully loaded target ───────────────────────────────────────────────────────

export interface LoadedPlayerFrame {
  visitId: string
  visitType: 'full' | 'partial'
  dateStart: string
  dateEnd: string
  band: string
  imageUrl: string        // /data/<target-id>/frames/<band>/<visit>.png
  diffUrl: string | null  // /data/<target-id>/diff/<band>/<vA>_<vB>.png
  targetPng: BundleTargetPx
  nImages: number
  nCoadded: number
  bandsPresent: string[]
}

export interface LoadedBundleTarget {
  id: BundleTargetId
  manifest: BundleManifestEntry
  target: BundleTarget
  spectrum: BundleSpectrum
  /** Frames available for the default band, in visit order */
  defaultBandFrames: LoadedPlayerFrame[]
  /** Dict of all frames by band by visit */
  allFrames: Record<string, Record<string, LoadedPlayerFrame>>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: 'force-cache' })
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  return r.json()
}

/** Resolve a path relative to a target directory */
function targetUrl(targetId: string, relPath: string): string {
  return `/data/${targetId}/${relPath}`
}

// Module-level cache to avoid re-fetching manifest/targets on every call
let _manifest: BundleManifest | null = null

export async function loadManifest(): Promise<BundleManifest> {
  if (_manifest) return _manifest
  _manifest = await fetchJson<BundleManifest>('/data/manifest.json')
  return _manifest!
}

export async function loadBundleTarget(targetId: BundleTargetId): Promise<LoadedBundleTarget> {
  const [manifest, target, spectrum] = await Promise.all([
    loadManifest(),
    fetchJson<BundleTarget>(`/data/${targetId}/target.json`),
    fetchJson<BundleSpectrum>(`/data/${targetId}/spectrum.json`),
  ])

  const mEntry = manifest.targets.find(t => t.id === targetId)
  if (!mEntry) throw new Error(`Target ${targetId} not in manifest`)

  const defaultBand = mEntry.default_band

  // Build frame list for default band
  const defaultBandFrames: LoadedPlayerFrame[] = []
  const allFrames: Record<string, Record<string, LoadedPlayerFrame>> = {}

  // Determine diff pair for default band
  const diffPair = target.stretch[defaultBand]?.diff?.pair ?? null
  const diffPath = target.paths[defaultBand]?.['diff'] as string | undefined

  for (const visit of target.visits) {
    for (const band of mEntry.bands) {
      const bandPaths = target.paths[band]
      if (!bandPaths) continue
      const visitPaths = bandPaths[visit.id] as { png: string; f32: string; mask: string } | undefined
      if (!visitPaths) continue

      const isDefaultBand = band === defaultBand
      const diffForThisVisit =
        isDefaultBand && diffPair && diffPath &&
        (visit.id === diffPair[0] || visit.id === diffPair[1])
          ? targetUrl(targetId, diffPath) : null

      const frame: LoadedPlayerFrame = {
        visitId: visit.id,
        visitType: visit.full ? 'full' : 'partial',
        dateStart: visit.date_start,
        dateEnd: visit.date_end,
        band,
        imageUrl: targetUrl(targetId, visitPaths.png),
        diffUrl: diffForThisVisit,
        targetPng: visit.target_px,
        nImages: visit.n_images,
        nCoadded: visit.n_coadded[band] ?? 0,
        bandsPresent: visit.bands_present,
      }

      if (!allFrames[band]) allFrames[band] = {}
      allFrames[band][visit.id] = frame

      if (isDefaultBand) defaultBandFrames.push(frame)
    }
  }

  return { id: targetId, manifest: mEntry, target, spectrum, defaultBandFrames, allFrames }
}

/** Returns visits for a specific band, using the target.json paths */
export function framesForBand(loaded: LoadedBundleTarget, band: string): LoadedPlayerFrame[] {
  const frames: LoadedPlayerFrame[] = []
  const diffPath = loaded.target.paths[band]?.['diff'] as string | undefined
  const diffPair = loaded.target.stretch[band]?.diff?.pair ?? null

  for (const visit of loaded.target.visits) {
    const bandPaths = loaded.target.paths[band]
    if (!bandPaths) continue
    const visitPaths = bandPaths[visit.id] as { png: string; f32: string; mask: string } | undefined
    if (!visitPaths) continue

    const diffForThisVisit =
      diffPair && diffPath && (visit.id === diffPair[0] || visit.id === diffPair[1])
        ? targetUrl(loaded.id, diffPath) : null

    frames.push({
      visitId: visit.id,
      visitType: visit.full ? 'full' : 'partial',
      dateStart: visit.date_start,
      dateEnd: visit.date_end,
      band,
      imageUrl: targetUrl(loaded.id, visitPaths.png),
      diffUrl: diffForThisVisit,
      targetPng: visit.target_px,
      nImages: visit.n_images,
      nCoadded: visit.n_coadded[band] ?? 0,
      bandsPresent: visit.bands_present,
    })
  }
  return frames
}

/** True if this target has any usable spectrum bins */
export function hasUsableSpectrum(spectrum: BundleSpectrum): boolean {
  return spectrum.binned.some(b => b.flux !== null)
}

/** WISE 0855: channels contaminated by the nearby Gaia star (0.75–2.5 µm) */
export function wise0855ContaminatedChannel(wl: number): boolean {
  return wl < 2.5
}
