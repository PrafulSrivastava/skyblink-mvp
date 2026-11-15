/**
 * Loader and types for the long-baseline (WISE 2010 vs SPHEREx 2025–26) bundle.
 * Data: public/data/longbaseline.json (index) and public/data/<id>/longbaseline/longbaseline.json.
 * Produced by pipeline/longbaseline (lb.py, lb_finalize.py).
 */

export type LbBand = 'W1' | 'W2'

export interface LbLabel {
  kind: 'info' | 'warn'
  text: string
  bands: LbBand[]
}

export interface LbIndexTarget {
  id: string
  name: string
  short: string
  default_band: LbBand
  data: string
  labels: LbLabel[]
}

export interface LbIndex {
  version: number
  title: string
  band_note: string
  normalisation: string
  targets: LbIndexTarget[]
}

export interface LbPx { x: number; y: number; png_x: number; png_y: number }

export interface LbFit { offset_from_pred_px: number | null }

export interface LbPair {
  usable: boolean
  wise_band: LbBand
  wise_um: number
  spherex_label: string
  spherex_window_um: [number, number]
  spherex_visit: string
  spherex_n_frames: number
  spherex_date_start: string
  spherex_date_end: string
  spherex_wl_um: [number, number]
  wise_px: LbPx
  spherex_px: LbPx
  shift_arcsec: number
  fit: { wise: LbFit | null; spherex: LbFit | null }
  paths: { wise: string; spherex: string }
}

export interface LbTarget {
  id: string
  name: string
  wise: { survey: string; date: string; date_start: string; date_end: string }
  pairs: Partial<Record<LbBand, LbPair>>
  motion: {
    baseline_years: number
    expected_shift_arcsec: number
    expected_shift_px: number
    position_angle_deg: number
    pm_total_mas_yr: number
    source: string
  }
}

export const LB_BANDS: { id: LbBand; label: string; um: string }[] = [
  { id: 'W1', label: 'WISE W1', um: '3.4 µm' },
  { id: 'W2', label: 'WISE W2', um: '4.6 µm' },
]

let _index: Promise<LbIndex> | null = null
const _targets = new Map<string, Promise<LbTarget>>()

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: 'force-cache' })
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  return r.json()
}

export function loadLbIndex(): Promise<LbIndex> {
  if (!_index) _index = getJson<LbIndex>('/data/longbaseline.json').catch(e => { _index = null; throw e })
  return _index
}

export async function loadLbTarget(id: string): Promise<{ meta: LbIndexTarget; data: LbTarget; index: LbIndex }> {
  const index = await loadLbIndex()
  const meta = index.targets.find(t => t.id === id) ?? index.targets[0]
  let p = _targets.get(meta.id)
  if (!p) {
    p = getJson<LbTarget>(`/data/${meta.data}`)
    _targets.set(meta.id, p)
    p.catch(() => _targets.delete(meta.id))
  }
  return { meta, data: await p, index }
}

export function lbImageUrl(targetId: string, relPath: string): string {
  return `/data/${targetId}/${relPath}`
}

/** Pick a usable band: the requested one if usable, else the target default. */
export function resolveLbBand(data: LbTarget, meta: LbIndexTarget, wanted?: string | null): LbBand {
  if ((wanted === 'W1' || wanted === 'W2') && data.pairs[wanted]?.usable) return wanted
  return meta.default_band
}

/** "2010-03-20" -> "20 Mar 2010" (UTC, so it never shifts a day). */
export function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** "2025-08-15" -> "Aug 2025" */
export function formatMonth(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}
