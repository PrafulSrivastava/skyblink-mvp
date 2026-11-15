'use client'

import React, { useState } from 'react'
import { ExternalLink, Copy, Check, AlertTriangle } from 'lucide-react'
import { formatMonth } from '@/lib/long-baseline'
import { Term } from '@/components/Term'
import type { LoadedBundleTarget, LoadedPlayerFrame } from '@/lib/bundle-loader'

interface MetadataPanelProps {
  loaded: LoadedBundleTarget | null
  currentFrame: LoadedPlayerFrame | null
}

function RA({ deg }: { deg: number }) {
  const h = Math.floor(deg / 15)
  const m = Math.floor((deg / 15 - h) * 60)
  const s = ((deg / 15 - h) * 60 - m) * 60
  return <span className="font-mono text-sky-ink">{h.toString().padStart(2,'0')}h{m.toString().padStart(2,'0')}m{s.toFixed(2).padStart(5,'0')}s</span>
}

function Dec({ deg }: { deg: number }) {
  const sign = deg < 0 ? '−' : '+'
  const abs = Math.abs(deg)
  const d = Math.floor(abs)
  const m = Math.floor((abs - d) * 60)
  const s = ((abs - d) * 60 - m) * 60
  return <span className="font-mono text-sky-ink">{sign}{d.toString().padStart(2,'0')}°{m.toString().padStart(2,'0')}′{s.toFixed(1).padStart(4,'0')}″</span>
}

export default function MetadataPanel({ loaded, currentFrame }: MetadataPanelProps) {
  const [copied, setCopied] = useState(false)

  if (!loaded) return null

  const { target, manifest } = loaded

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const motionCheck = target.checks?.motion_first_last_full_visit
  const defaultBand = target.default_band
  const motionBand = motionCheck?.per_band?.[defaultBand]

  return (
    <section aria-labelledby="details-h" className="bg-sky-surface rounded-xl border border-sky-border p-4 space-y-4 text-sm">
      <h2 id="details-h" className="text-base font-semibold text-sky-ink">Position and motion</h2>
      {/* Mean-epoch position */}
      <div>
        <h3 className="text-sky-inkDim text-xs font-semibold uppercase tracking-wider mb-1.5">
          Where it is now <span className="normal-case font-normal">(<Term k="epoch">{formatMonth(target.mean_epoch.date)}</Term>)</span>
        </h3>
        <div className="space-y-1">
          <div className="flex justify-between"><span className="text-sky-inkDim"><Term k="ra">RA</Term></span><RA deg={target.mean_epoch.ra_deg} /></div>
          <div className="flex justify-between"><span className="text-sky-inkDim"><Term k="dec">Dec</Term></span><Dec deg={target.mean_epoch.dec_deg} /></div>
        </div>
      </div>

      {/* Input coordinate staleness */}
      {target.input.offset_from_mean_epoch_position_arcsec > 5 && (
        <div className="p-3 rounded-lg border border-amber-400/40 bg-amber-400/5">
          <div className="flex items-center gap-1.5 text-amber-200 font-semibold"><AlertTriangle className="w-4 h-4" aria-hidden="true" /><span><Term k="catalogue">Catalogue</Term> position is <Term k="staleCoordinate">out of date</Term></span></div>
          <div className="text-sky-inkDim mt-1">
            {target.id === 'wise-0855'
              ? `Brief coordinate is ${target.input.offset_from_mean_epoch_position_arcsec.toFixed(0)}″ (${target.input.offset_from_mean_epoch_position_px.toFixed(1)} px) from actual position`
              : `J2016 catalogue coord is ${target.input.offset_from_mean_epoch_position_arcsec.toFixed(0)}″ off`
            }
          </div>
          <div className="text-sky-inkDim text-xs mt-1">
            Source: {target.input.source}
          </div>
        </div>
      )}

      {/* Proper motion */}
      <div>
        <h3 className="text-sky-inkDim text-xs font-semibold uppercase tracking-wider mb-1.5"><Term k="properMotion">Motion across the sky</Term></h3>
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-sky-inkDim">East–west <Term k="pmRa" className="font-mono">μα·cosδ</Term></span>
            <span className="font-mono text-sky-ink">{target.catalog.pmra.toFixed(0)} <Term k="masPerYear">mas/yr</Term></span>
          </div>
          <div className="flex justify-between">
            <span className="text-sky-inkDim">North–south <Term k="pmDec" className="font-mono">μδ</Term></span>
            <span className="font-mono text-sky-ink">{target.catalog.pmdec.toFixed(0)} <Term k="masPerYear">mas/yr</Term></span>
          </div>
          <div className="flex justify-between">
            <span className="text-sky-inkDim"><Term k="catalogue">Catalogue</Term></span>
            <span className="font-mono text-sky-accent text-xs"><Term k={/catwise/i.test(target.catalog.catalog) ? 'catwise' : 'gaia'}>{target.catalog.catalog}</Term></span>
          </div>
        </div>
      </div>

      {/* Motion measurement */}
      {motionBand && (
        <div>
          <h3 className="text-sky-inkDim text-xs font-semibold uppercase tracking-wider mb-1.5">
            <Term k="measuredShift">Measured shift</Term> <span className="normal-case font-normal">(<Term k="band">band</Term> {defaultBand}, first to last full <Term k="visit">visit</Term>)</span>
          </h3>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-sky-inkDim"><Term k="predictedShift">Predicted</Term></span>
              <span className="font-mono text-sky-ink">{motionCheck.predicted_shift_px.toFixed(2)} px</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sky-inkDim"><Term k="measuredShift">Measured</Term></span>
              <span className="font-mono text-sky-ink">{typeof motionBand.measured_shift_px === 'number' ? `${motionBand.measured_shift_px.toFixed(2)} px` : 'not measured'}</span>
            </div>
            {motionBand.comparison_shift_px !== undefined && (
              <div className="flex justify-between">
                <span className="text-sky-inkDim"><Term k="comparisonStar">Comparison star</Term></span>
                <span className="font-mono text-sky-ink">{motionBand.comparison_shift_px.toFixed(2)} px</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Current frame */}
      {currentFrame && (
        <div>
          <h3 className="text-sky-inkDim text-xs font-semibold uppercase tracking-wider mb-1.5">This image</h3>
          <div className="space-y-1">
            <div className="flex justify-between"><span className="text-sky-inkDim"><Term k="visit">Visit</Term></span><span className="font-mono text-sky-ink">{currentFrame.visitId}</span></div>
            <div className="flex justify-between"><span className="text-sky-inkDim">Dates</span><span className="font-mono text-sky-ink">{currentFrame.dateStart} to {currentFrame.dateEnd}</span></div>
            <div className="flex justify-between"><span className="text-sky-inkDim"><Term k="band">Band</Term></span><span className="font-mono text-sky-accent">{currentFrame.band}</span></div>
            <div className="flex justify-between">
              <span className="text-sky-inkDim"><Term k="partialVisit">Visit type</Term></span>
              <span className={`${currentFrame.visitType === 'full' ? 'text-sky-ink' : 'text-amber-300'}`}>
                {currentFrame.visitType}
              </span>
            </div>
            <div className="flex justify-between"><span className="text-sky-inkDim"><Term k="framesStacked">Frames stacked</Term></span><span className="font-mono text-sky-ink">{currentFrame.nCoadded}</span></div>
          </div>
        </div>
      )}

      {/* Data links */}
      <div>
        <h3 className="text-sky-inkDim text-xs font-semibold uppercase tracking-wider mb-1.5">Original data (<Term k="dr1qr3">DR1 and QR3</Term>)</h3>
        <div className="space-y-1">
          <a href="https://doi.org/10.26131/IRSA678" target="_blank" rel="noopener noreferrer"
            className="flex min-h-10 items-center gap-1.5 text-sky-inkDim hover:text-sky-accent transition-colors">
            <ExternalLink className="w-4 h-4" aria-hidden="true" />SPHEREx DR1 (doi:10.26131/IRSA678)<span className="sr-only"> (opens in a new tab)</span>
          </a>
          <a href="https://doi.org/10.26131/IRSA662" target="_blank" rel="noopener noreferrer"
            className="flex min-h-10 items-center gap-1.5 text-sky-inkDim hover:text-sky-accent transition-colors">
            <ExternalLink className="w-4 h-4" aria-hidden="true" />SPHEREx QR3 (doi:10.26131/IRSA662)<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </div>

      <button type="button" onClick={copyLink}
        className="w-full min-h-11 flex items-center justify-center gap-1.5 rounded-lg border border-sky-border text-sky-ink hover:border-sky-accent/50 transition-colors">
        {copied ? <Check className="w-4 h-4 text-sky-accent" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
        {copied ? 'Link copied' : 'Copy link to this view'}
      </button>
      <p className="sr-only" aria-live="polite">{copied ? 'Link copied to clipboard' : ''}</p>
    </section>
  )
}
