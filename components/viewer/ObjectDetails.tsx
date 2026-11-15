'use client'

import React from 'react'
import { ExternalLink, X } from 'lucide-react'
import type { SkyObject, ObjectThresholds } from '@/lib/sky-objects'
import { formatPm, simbadUrl, irsaUrl } from '@/lib/object-list'

interface ObjectDetailsProps {
  object: SkyObject
  thresholds: ObjectThresholds
  onClose: () => void
}

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

// Sexagesimal helpers, copied from MetadataPanel.tsx (that file is not modified).
function fmtRA(deg: number | null | undefined): string {
  if (!finite(deg)) return '—'
  const h = Math.floor(deg / 15)
  const m = Math.floor((deg / 15 - h) * 60)
  const s = ((deg / 15 - h) * 60 - m) * 60
  return `${h.toString().padStart(2, '0')}h${m.toString().padStart(2, '0')}m${s.toFixed(2).padStart(5, '0')}s`
}

function fmtDec(deg: number | null | undefined): string {
  if (!finite(deg)) return '—'
  const sign = deg < 0 ? '−' : '+'
  const abs = Math.abs(deg)
  const d = Math.floor(abs)
  const m = Math.floor((abs - d) * 60)
  const s = ((abs - d) * 60 - m) * 60
  return `${sign}${d.toString().padStart(2, '0')}°${m.toString().padStart(2, '0')}′${s.toFixed(1).padStart(4, '0')}″`
}

const SECTION = 'text-sky-inkDim text-[10px] font-mono uppercase tracking-wider mb-1'
const LINK = 'flex items-center gap-1 text-[11px] text-sky-inkDim hover:text-sky-accent transition-colors'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-sky-inkDim">{label}</span>
      <span className="font-mono text-sky-ink text-right">{children}</span>
    </div>
  )
}

export default function ObjectDetails({ object, thresholds, onClose }: ObjectDetailsProps) {
  const catalogs = Array.isArray(object.catalogs) ? object.catalogs : []
  const pm = object.pm_mas_yr ?? null
  const radius = thresholds?.match_radius_arcsec
  const hasPos = finite(object.ra) && finite(object.dec)
  const hasCatPos = finite(object.catalog_ra) && finite(object.catalog_dec)

  const categoryLabel = object.kind === 'known' ? 'Known' : 'Unidentified'

  const badge =
    object.moving && object.motion_basis === 'catalog'
      ? 'catalog proper motion'
      : object.moving && object.motion_basis === 'image'
        ? `image shift${finite(object.image_shift_px) ? ` ${object.image_shift_px} px` : ''}`
        : null

  const magRows = catalogs.flatMap(c =>
    Object.entries(c?.mags ?? {})
      .filter(([, v]) => finite(v))
      .map(([band, v]) => ({ key: `${c.catalog}-${band}`, catalog: c.catalog, band, value: v as number })),
  )

  return (
    <div className="mt-3 pt-3 border-t border-sky-border space-y-3 text-xs" data-testid="object-details">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sky-ink font-semibold break-words">{object.name || object.id}</div>
          <div className="text-sky-inkDim font-mono text-[10px]">{object.id}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close object details"
          className="text-sky-inkDim hover:text-sky-ink transition-colors flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-sky-accent">{categoryLabel}</span>
          {badge && (
            <span className="px-1.5 py-0.5 rounded border border-sky-accent/40 bg-sky-accent/10 text-sky-accent text-[10px]">
              High proper motion · {badge}
            </span>
          )}
        </div>
        {object.reason && <div className="text-sky-inkDim">{object.reason}</div>}
        {object.kind === 'unidentified' && (
          <div className="text-sky-inkDim">
            No CatWISE, AllWISE or 2MASS source within {finite(radius) ? `${radius.toFixed(1)} arcsec` : 'the match radius'}.
            {' '}This is not a discovery claim.
          </div>
        )}
      </div>

      <div>
        <div className={SECTION}>Proper motion</div>
        <div className="space-y-1">
          <Row label="μ_RA·cosδ">{finite(pm?.pmra) ? `${pm.pmra.toFixed(0)} mas/yr` : '—'}</Row>
          <Row label="μ_Dec">{finite(pm?.pmdec) ? `${pm.pmdec.toFixed(0)} mas/yr` : '—'}</Row>
          <Row label="Total">{formatPm(pm)}</Row>
        </div>
      </div>

      {magRows.length > 0 && (
        <div>
          <div className={SECTION}>Magnitudes</div>
          <div className="space-y-1">
            {magRows.map(m => (
              <Row key={m.key} label={`${m.catalog} ${m.band}`}>{m.value.toFixed(2)}</Row>
            ))}
          </div>
        </div>
      )}

      {catalogs.length > 0 && (
        <div>
          <div className={SECTION}>Catalog matches</div>
          <div className="space-y-1">
            {catalogs.map((c, i) => (
              <Row key={`${c?.catalog}-${c?.id}-${i}`} label={c?.catalog ?? '—'}>
                {c?.id ?? '—'} · {finite(c?.sep_arcsec) ? `${c.sep_arcsec.toFixed(2)}″` : '—'}
              </Row>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className={SECTION}>Position (mean epoch)</div>
        <div className="space-y-1">
          <Row label="Detection RA">{fmtRA(object.ra)}</Row>
          <Row label="Detection Dec">{fmtDec(object.dec)}</Row>
          {hasCatPos && <Row label="Catalog RA">{fmtRA(object.catalog_ra)}</Row>}
          {hasCatPos && <Row label="Catalog Dec">{fmtDec(object.catalog_dec)}</Row>}
          <Row label="S/N">
            {!object.detected ? 'not measured (core masked)' : finite(object.snr) ? object.snr.toFixed(1) : '—'}
          </Row>
        </div>
      </div>

      {hasPos && (
        <div className="space-y-1">
          <a href={simbadUrl(object.ra, object.dec)} target="_blank" rel="noopener noreferrer" className={LINK}>
            <ExternalLink className="w-3 h-3" />SIMBAD (coordinates)
          </a>
          <a href={irsaUrl(object.ra, object.dec)} target="_blank" rel="noopener noreferrer" className={LINK}>
            <ExternalLink className="w-3 h-3" />IRSA CatWISE (10″ cone)
          </a>
        </div>
      )}
    </div>
  )
}
