'use client'

import React from 'react'
import { ExternalLink, X } from 'lucide-react'
import { Term } from '@/components/Term'
import type { SkyObject, ObjectThresholds } from '@/lib/sky-objects'
import { formatPm, simbadUrl, irsaUrl, linkPosition } from '@/lib/object-list'

const J2000_MJD = 51544.5
const CATWISE_MJD = 57170

interface ObjectDetailsProps {
  object: SkyObject
  thresholds: ObjectThresholds
  meanEpochMjd: number // epoch of object.ra/dec; link-out positions are carried from it with the catalog proper motion
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

const SECTION = 'text-sky-inkDim text-xs font-semibold uppercase tracking-wider mb-1'
const LINK = 'flex items-center gap-1 text-xs text-sky-inkDim hover:text-sky-accent transition-colors'

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-sky-inkDim">{label}</span>
      <span className="font-mono text-sky-ink text-right">{children}</span>
    </div>
  )
}

export default function ObjectDetails({ object, thresholds, meanEpochMjd, onClose }: ObjectDetailsProps) {
  const catalogs = Array.isArray(object.catalogs) ? object.catalogs : []
  const pm = object.pm_mas_yr ?? null
  const radius = thresholds?.match_radius_arcsec
  const hasPos = finite(object.ra) && finite(object.dec)
  const hasCatPos = finite(object.catalog_ra) && finite(object.catalog_dec)
  const note = object.undetected_note ?? null
  const simbadPos = hasPos ? linkPosition(object.ra, object.dec, pm, meanEpochMjd, J2000_MJD) : null
  const irsaPos = hasPos ? linkPosition(object.ra, object.dec, pm, meanEpochMjd, CATWISE_MJD) : null

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
          <div className="text-sky-inkDim font-mono text-xs">{object.id}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close object details"
          className="inline-flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-sky-inkDim hover:text-sky-ink transition-colors flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-sky-accent"><Term k={object.kind === 'known' ? 'known' : 'unidentified'}>{categoryLabel}</Term></span>
          {badge && (
            <span className="px-1.5 py-0.5 rounded border border-sky-accent/40 bg-sky-accent/10 text-sky-accent text-xs">
              <Term k="fastMover">High proper motion</Term> · {badge}
            </span>
          )}
        </div>
        {object.reason && <div className="text-sky-inkDim">{object.reason}</div>}
        {object.kind === 'unidentified' && (
          <div className="text-sky-inkDim">
            No <Term k="catwise">CatWISE</Term>, <Term k="allwise">AllWISE</Term> or <Term k="twomass">2MASS</Term> source within {finite(radius) ? <>{radius.toFixed(1)} <Term k="arcsecond">arcsec</Term></> : 'the match radius'}.
            {' '}This is not a discovery claim.
          </div>
        )}
      </div>

      <div>
        <div className={SECTION}><Term k="properMotion">Proper motion</Term></div>
        <div className="space-y-1">
          <Row label={<>East–west <Term k="pmRa">μα·cosδ</Term></>}>{finite(pm?.pmra) ? <>{pm.pmra.toFixed(0)} <Term k="masPerYear">mas/yr</Term></> : '—'}</Row>
          <Row label={<>North–south <Term k="pmDec">μδ</Term></>}>{finite(pm?.pmdec) ? <>{pm.pmdec.toFixed(0)} <Term k="masPerYear">mas/yr</Term></> : '—'}</Row>
          <Row label="Total">{formatPm(pm)}</Row>
        </div>
      </div>

      {magRows.length > 0 && (
        <div>
          <div className={SECTION}><Term k="magnitude">Magnitudes</Term></div>
          <div className="space-y-1">
            {magRows.map(m => (
              <Row key={m.key} label={`${m.catalog} ${m.band}`}>{m.value.toFixed(2)}</Row>
            ))}
          </div>
        </div>
      )}

      {catalogs.length > 0 && (
        <div>
          <div className={SECTION}><Term k="catalogue">Catalog</Term> matches</div>
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
        <div className={SECTION}>Position (mean <Term k="epoch">epoch</Term>)</div>
        <div className="space-y-1">
          <Row label={<>{object.detected ? 'Detection' : 'Position'} <Term k="ra">RA</Term></>}>{fmtRA(object.ra)}</Row>
          <Row label={<>{object.detected ? 'Detection' : 'Position'} <Term k="dec">Dec</Term></>}>{fmtDec(object.dec)}</Row>
          {hasCatPos && <Row label={<>{object.detected ? 'Catalog' : 'Catalog position'} <Term k="ra">RA</Term></>}>{fmtRA(object.catalog_ra)}</Row>}
          {hasCatPos && <Row label={<>{object.detected ? 'Catalog' : 'Catalog position'} <Term k="dec">Dec</Term></>}>{fmtDec(object.catalog_dec)}</Row>}
          <Row label={<Term k="snr">S/N</Term>}>
            {!object.detected ? (note ? `not measured (${note})` : 'not measured') : finite(object.snr) ? object.snr.toFixed(1) : '—'}
          </Row>
        </div>
      </div>

      {simbadPos && irsaPos && (
        <div className="space-y-1">
          <a href={simbadUrl(simbadPos.ra, simbadPos.dec)} target="_blank" rel="noopener noreferrer" className={LINK}
            title="Position carried to J2000 with the catalog proper motion">
            <ExternalLink className="w-3 h-3" />SIMBAD (coordinates)
          </a>
          <a href={irsaUrl(irsaPos.ra, irsaPos.dec)} target="_blank" rel="noopener noreferrer" className={LINK}
            title="Position carried to the CatWISE2020 epoch (MJD 57170) with the catalog proper motion">
            <ExternalLink className="w-3 h-3" />IRSA CatWISE (10″ cone)
          </a>
        </div>
      )}
    </div>
  )
}
