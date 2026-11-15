'use client'

import React, { useState, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { Download, X, AlertTriangle, Sun } from 'lucide-react'
import type { BundleSpectrumBinned, BundleSpectrum } from '@/lib/bundle-loader'
import { Hint, RichText, Term } from '@/components/Term'

interface SpectrumPanelProps {
  spectrum: BundleSpectrum | null
  targetId: string
  isLoading?: boolean
  onClose?: () => void
}

const DETECTOR_BOUNDARIES = [1.09, 1.62, 2.42, 3.82, 4.42]

const MOLECULAR_BANDS = [
  { name: 'H₂O', wavelength: 1.4,  note: 'Water vapour absorbs light here. A dip means water in a cool atmosphere.' },
  { name: 'H₂O', wavelength: 1.9,  note: 'Water vapour absorbs light here. A dip means water in a cool atmosphere.' },
  { name: 'CH₄', wavelength: 2.2,  note: 'Methane absorbs light here. It only forms in very cool atmospheres such as brown dwarfs.' },
  { name: 'CH₄', wavelength: 3.3,  note: 'The strongest methane band. Epsilon Indi B shows a clear dip here.' },
  { name: 'CO',  wavelength: 2.35, note: 'Carbon monoxide absorbs light here, common in cool stars.' },
  { name: 'CO₂', wavelength: 4.25, note: 'Carbon dioxide absorbs light here.' },
]

/** Per-target honest headers */
const TARGET_SPECTRUM_STATE: Record<string, {
  title: string
  subtitle: string
  saturated?: boolean
  blendWarning?: string
}> = {
  'barnards-star': {
    title: 'Spectrum unavailable',
    subtitle: '349 of 350 frames are [[saturated|saturated]] at the star (flagged OVERFLOW or NONLINEAR). Barnard\'s Star is far brighter than [[SPHEREx|spherex]] can measure without saturating.',
    saturated: true,
  },
  'eps-indi-b': {
    title: 'Epsilon Indi B spectrum',
    subtitle: 'A pair of [[brown dwarfs|brownDwarf]]. Hover the 3.3 [[µm|micron]] [[CH₄|methane]] label to see the methane dip. 4 of 102 [[channels|channel]] [[saturated|saturated]].',
    saturated: false,
  },
  'wise-0855': {
    title: 'WISE 0855 spectrum',
    subtitle: 'Light above 4.4 [[µm|micron]] ([[band|band]] D6) from WISE 0855. [[Channels|channel]] marked contaminated are dominated by a [[Gaia|gaia]] star ([[G|gMag]] = 16.3) 7.8[[″|arcsecond]] away.',
    blendWarning: '0.75–2.5 µm: contaminated by Gaia DR3 5756956644387831296 (G=16.3, 7.8″). Do not read as WISE 0855.',
    saturated: false,
  },
  'rw-aur': {
    title: 'RW Aur spectrum',
    subtitle: '301 of 327 frames [[saturated|saturated]]. Only the 26 unsaturated [[band|band]] D1 frames carry usable brightness, and they show it varying.',
    saturated: false,
  },
  'r-dra': {
    title: 'Spectrum unavailable',
    subtitle: 'R Dra is fully [[saturated|saturated]] (515 of 515 frames). The [[PSF-wing|psfWing]] brightness ratio in the Diff view tracks its variability instead.',
    saturated: true,
  },
}

export default function SpectrumPanel({ spectrum, targetId, isLoading, onClose }: SpectrumPanelProps) {
  const [hoveredBand, setHoveredBand] = useState<string | null>(null)

  const state = TARGET_SPECTRUM_STATE[targetId]
  const binned = spectrum?.binned ?? []

  // Filter to usable channels
  const chartData = binned.map(b => {
    const isContaminated = targetId === 'wise-0855' && b.wavelength_um < 2.5
    return {
      w:   parseFloat(b.wavelength_um.toFixed(3)),
      flux: (b.flux !== null && !isContaminated) ? b.flux : null,
      flux_cont: (b.flux !== null && isContaminated) ? b.flux : null,
      n:    b.n,
      sat:  b.n_saturated,
      contaminated: isContaminated,
    }
  })

  const usableFluxes = chartData
    .filter(d => d.flux !== null)
    .map(d => d.flux as number)

  const yMax = usableFluxes.length ? Math.max(...usableFluxes) * 1.15 : 1
  const yMin = usableFluxes.length ? Math.min(0, Math.min(...usableFluxes)) : 0

  const downloadCSV = useCallback(() => {
    const header = 'channel,wavelength_um,flux_uJy,flux_err_uJy,n_good,n_saturated,n_flagged,contaminated_blend\n'
    const rows = binned.map((b, i) => {
      const cont = targetId === 'wise-0855' && b.wavelength_um < 2.5
      return `${b.channel},${b.wavelength_um},${b.flux ?? ''},${b.flux_err ?? ''},${b.n},${b.n_saturated},${b.n_flagged},${cont}`
    })
    const blob = new Blob([header + rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${targetId}_spectrum.csv`; a.click()
  }, [binned, targetId])

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const pt = payload[0]?.payload
    return (
      <div className="bg-sky-surface border border-sky-border rounded px-2 py-1.5 text-xs font-mono">
        <div className="text-sky-accent">{label} µm</div>
        {pt?.contaminated ? (
          <div className="text-orange-400">Blended (Gaia star)</div>
        ) : pt?.flux !== null ? (
          <div className="text-sky-ink">F = {pt.flux?.toFixed(0)} µJy  (n={pt.n})</div>
        ) : (
          <div className="text-sky-inkDim">no data / saturated</div>
        )}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="bg-sky-surface rounded-lg border border-sky-border p-4">
        <div className="text-sky-inkDim text-sm font-mono text-center py-8">Extracting spectrum…</div>
      </div>
    )
  }

  return (
    <section aria-label="Spectrum" className="bg-sky-surface rounded-xl border border-sky-border p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sky-ink text-base font-semibold">{state?.title ?? 'Spectrum'}</h2>
            {state?.saturated && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-mono">
                <Term k="saturated">saturated</Term>
              </span>
            )}
          </div>
          {state?.subtitle && (
            <div className="text-sky-inkDim text-xs mt-1 max-w-lg"><RichText text={state.subtitle} /></div>
          )}
        </div>
        <div className="flex gap-2 ml-4 flex-shrink-0">
          {spectrum && (
            <button type="button" onClick={downloadCSV}
              className="flex min-h-11 sm:min-h-9 items-center gap-1 px-3 rounded-lg text-sm text-sky-inkDim hover:text-sky-ink border border-sky-border hover:border-sky-accent/50 transition-colors">
              <Download className="w-4 h-4" aria-hidden="true" /> Download CSV
            </button>
          )}
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close spectrum" className="inline-flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-sky-inkDim hover:text-sky-ink transition-colors">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Blend warning box */}
      {state?.blendWarning && (
        <div className="mb-3 flex gap-2 p-2 rounded border border-orange-500/30 bg-orange-500/5">
          <AlertTriangle className="w-3.5 h-3.5 text-orange-400 mt-0.5 flex-shrink-0" />
          <span className="text-orange-400 text-xs">{state.blendWarning}</span>
        </div>
      )}

      {state?.saturated ? (
        // Saturated state: no chart, just explanation
        <div className="flex items-center justify-center py-8 rounded border border-sky-border bg-sky-bg">
          <div className="text-center text-sky-inkDim">
            <Sun className="w-8 h-8 mx-auto mb-3 text-amber-300" aria-hidden="true" />
            <div className="text-sm font-mono">Spectrum saturated — no calibrated flux</div>
            <div className="text-xs mt-2">
              {targetId === 'r-dra'
                ? 'PSF-wing ratio in diff panel is the variability proxy.'
                : 'Motion measurement uses the unmasked PSF wings in the diff view.'}
            </div>
          </div>
        </div>
      ) : usableFluxes.length === 0 ? (
        <div className="text-center text-sky-inkDim text-sm py-8">No usable channels in this spectrum.</div>
      ) : (
        <>
          {/* Molecular band pills */}
          <div className="flex gap-1.5 mb-3 flex-wrap">
            {MOLECULAR_BANDS.map(b => {
              const key = `${b.name}-${b.wavelength}`
              return (
                <Hint key={key} entry={{ term: `${b.name} at ${b.wavelength} µm`, def: b.note }}>
                <button
                  onMouseEnter={() => setHoveredBand(key)}
                  onFocus={() => setHoveredBand(key)}
                  onBlur={() => setHoveredBand(null)}
                  type="button"
                  onMouseLeave={() => setHoveredBand(null)}
                  className={`px-2 py-0.5 rounded-full text-xs font-mono transition-colors ${
                    hoveredBand === key
                      ? 'bg-sky-accent/20 text-sky-accent border border-sky-accent/40'
                      : 'bg-sky-surface2 text-sky-inkDim border border-sky-border hover:border-sky-accent/30'
                  }`}>
                  {b.name} {b.wavelength}µm
                </button>
                </Hint>
              )
            })}
          </div>

          {/* Chart */}
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2a3c" />
                <XAxis dataKey="w" type="number" domain={[0.75, 5.0]}
                  tickFormatter={v => `${v}µ`}
                  tick={{ fontSize: 11, fill: '#a5b0c2', fontFamily: 'JetBrains Mono' }}
                  stroke="#1f2a3c" />
                <YAxis domain={[yMin * 0.9, yMax]}
                  tick={{ fontSize: 11, fill: '#a5b0c2', fontFamily: 'JetBrains Mono' }}
                  tickFormatter={v => v > 999 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0)}
                  stroke="#1f2a3c"
                  label={{ value: 'µJy', position: 'insideTopLeft', fontSize: 11, fill: '#8b96a8', offset: -4 }} />
                <Tooltip content={<CustomTooltip />} />

                {/* Detector boundaries */}
                {DETECTOR_BOUNDARIES.map(w => (
                  <ReferenceLine key={w} x={w} stroke="#1f2a3c" strokeDasharray="2 4" />
                ))}

                {/* Molecular bands */}
                {MOLECULAR_BANDS.map(b => {
                  const key = `${b.name}-${b.wavelength}`
                  return (
                    <ReferenceLine key={key} x={b.wavelength}
                      stroke={hoveredBand === key ? '#5ab9fc' : '#2a3a50'}
                      strokeDasharray="4 4"
                      label={{ value: b.name, position: 'top', fontSize: 10, fill: '#5ab9fc', fontFamily: 'JetBrains Mono' }} />
                  )
                })}

                {/* Main flux line */}
                <Line type="monotone" dataKey="flux"
                  dot={false} stroke="#5ab9fc" strokeWidth={1.5} connectNulls={false} />

                {/* Contaminated flux shown in orange */}
                {targetId === 'wise-0855' && (
                  <Line type="monotone" dataKey="flux_cont"
                    dot={false} stroke="#f97316" strokeWidth={1.5} strokeDasharray="4 4"
                    connectNulls={false} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-xs text-sky-inkDim">
            Brightness in <Term k="microjansky">µJy</Term> against wavelength in <Term k="micron">µm</Term>. Dashed lines mark the edges of the six <Term k="band">bands</Term> and common molecules.
          </p>

          {/* CH4 dip callout for Eps Indi B */}
          {targetId === 'eps-indi-b' && spectrum?.points && (() => {
            const ch4 = spectrum.binned.find(b => Math.abs(b.wavelength_um - 3.29) < 0.05)
            const ref = spectrum.binned.find(b => Math.abs(b.wavelength_um - 3.03) < 0.05)
            if (ch4?.flux && ref?.flux) {
              const ratio = ch4.flux / ref.flux
              return (
                <div className="mt-2 text-xs text-sky-inkDim">
                  3.3 µm CH₄ dip: F(3.29)/F(3.03) = {ratio.toFixed(2)} —{' '}
                  {ratio < 0.95 ? 'dip confirmed' : 'marginal'}.
                </div>
              )
            }
            return null
          })()}
        </>
      )}
    </section>
  )
}
