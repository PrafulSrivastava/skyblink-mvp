'use client'

import React, { useState } from 'react'
import { ExternalLink, Copy, Check } from 'lucide-react'
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
    <div className="bg-sky-surface rounded-lg border border-sky-border p-3 space-y-3 text-xs">
      {/* Mean-epoch position */}
      <div>
        <div className="text-sky-inkDim text-[10px] font-mono uppercase tracking-wider mb-1.5">
          Mean-epoch position ({target.mean_epoch.date})
        </div>
        <div className="space-y-1">
          <div className="flex justify-between"><span className="text-sky-inkDim">RA</span><RA deg={target.mean_epoch.ra_deg} /></div>
          <div className="flex justify-between"><span className="text-sky-inkDim">Dec</span><Dec deg={target.mean_epoch.dec_deg} /></div>
        </div>
      </div>

      {/* Input coordinate staleness */}
      {target.input.offset_from_mean_epoch_position_arcsec > 5 && (
        <div className="p-2 rounded border border-yellow-500/40 bg-yellow-500/5">
          <div className="text-yellow-400 font-mono text-[10px]">⚠ Input coord stale</div>
          <div className="text-sky-inkDim text-[10px] mt-0.5">
            {target.id === 'wise-0855'
              ? `Brief coordinate is ${target.input.offset_from_mean_epoch_position_arcsec.toFixed(0)}″ (${target.input.offset_from_mean_epoch_position_px.toFixed(1)} px) from actual position`
              : `J2016 catalogue coord is ${target.input.offset_from_mean_epoch_position_arcsec.toFixed(0)}″ off`
            }
          </div>
          <div className="text-sky-inkDim text-[10px] mt-0.5">
            Source: {target.input.source}
          </div>
        </div>
      )}

      {/* Proper motion */}
      <div>
        <div className="text-sky-inkDim text-[10px] font-mono uppercase tracking-wider mb-1.5">Proper motion</div>
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-sky-inkDim">μ_RA·cosδ</span>
            <span className="font-mono text-sky-ink">{target.catalog.pmra.toFixed(0)} mas/yr</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sky-inkDim">μ_Dec</span>
            <span className="font-mono text-sky-ink">{target.catalog.pmdec.toFixed(0)} mas/yr</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sky-inkDim">Catalogue</span>
            <span className="font-mono text-sky-accent text-[10px]">{target.catalog.catalog}</span>
          </div>
        </div>
      </div>

      {/* Motion measurement */}
      {motionBand && (
        <div>
          <div className="text-sky-inkDim text-[10px] font-mono uppercase tracking-wider mb-1.5">
            Motion ({defaultBand}, v1→v5 or first/last full)
          </div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-sky-inkDim">Predicted</span>
              <span className="font-mono text-sky-ink">{motionCheck.predicted_shift_px.toFixed(2)} px</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sky-inkDim">Measured</span>
              <span className="font-mono text-sky-ink">{typeof motionBand.measured_shift_px === 'number' ? `${motionBand.measured_shift_px.toFixed(2)} px` : 'not measured'}</span>
            </div>
            {motionBand.comparison_shift_px !== undefined && (
              <div className="flex justify-between">
                <span className="text-sky-inkDim">Ctrl-star shift</span>
                <span className="font-mono text-sky-ink">{motionBand.comparison_shift_px.toFixed(2)} px</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Current frame */}
      {currentFrame && (
        <div>
          <div className="text-sky-inkDim text-[10px] font-mono uppercase tracking-wider mb-1.5">Frame</div>
          <div className="space-y-1">
            <div className="flex justify-between"><span className="text-sky-inkDim">Visit</span><span className="font-mono text-sky-ink">{currentFrame.visitId}</span></div>
            <div className="flex justify-between"><span className="text-sky-inkDim">Dates</span><span className="font-mono text-sky-ink text-[10px]">{currentFrame.dateStart}…</span></div>
            <div className="flex justify-between"><span className="text-sky-inkDim">Band</span><span className="font-mono text-sky-accent">{currentFrame.band}</span></div>
            <div className="flex justify-between">
              <span className="text-sky-inkDim">Type</span>
              <span className={`font-mono text-[10px] ${currentFrame.visitType === 'full' ? 'text-green-400' : 'text-yellow-400'}`}>
                {currentFrame.visitType}
              </span>
            </div>
            <div className="flex justify-between"><span className="text-sky-inkDim">Co-adds</span><span className="font-mono text-sky-ink">{currentFrame.nCoadded}</span></div>
          </div>
        </div>
      )}

      {/* Data links */}
      <div>
        <div className="text-sky-inkDim text-[10px] font-mono uppercase tracking-wider mb-1.5">Data</div>
        <div className="space-y-1">
          <a href="https://doi.org/10.26131/IRSA678" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-sky-inkDim hover:text-sky-accent transition-colors">
            <ExternalLink className="w-3 h-3" />SPHEREx DR1 (doi:10.26131/IRSA678)
          </a>
          <a href="https://doi.org/10.26131/IRSA662" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-sky-inkDim hover:text-sky-accent transition-colors">
            <ExternalLink className="w-3 h-3" />SPHEREx QR3 (doi:10.26131/IRSA662)
          </a>
        </div>
      </div>

      <button onClick={copyLink}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded border border-sky-border text-sky-inkDim hover:text-sky-ink hover:border-sky-accent/50 text-xs transition-colors">
        {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
        {copied ? 'Copied!' : 'Copy link'}
      </button>
    </div>
  )
}
