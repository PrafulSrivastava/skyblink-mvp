'use client'

import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { BAND_INFO } from '@/lib/target-stories'
import { BAND_TIPS } from '@/lib/glossary'
import { Hint, Term } from '@/components/Term'

/** Band hue, shown only as a small dot; the selected state is always the accent. */
const BAND_COLORS: Record<string, string> = {
  D1: '#a78bfa', D2: '#5ab9fc', D3: '#4ade80',
  D4: '#facc15', D5: '#fb923c', D6: '#f87171',
}

interface BandPickerProps {
  value: string
  onChange: (band: string) => void
  availableBands: string[]
  defaultBand?: string
  saturated?: boolean
}

export default function BandPicker({ value, onChange, availableBands, defaultBand, saturated }: BandPickerProps) {
  const info = BAND_INFO[value]
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-sky-ink">
        <Term k="infrared">Infrared</Term> <Term k="band">band</Term> <span className="font-normal text-sky-inkDim">(shorter to longer wavelength)</span>
      </legend>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Detector bands D1 to D6">
        {(['D1', 'D2', 'D3', 'D4', 'D5', 'D6'] as const).map(band => {
          const available = availableBands.includes(band)
          const isSelected = value === band
          const isDefault = band === defaultBand
          return (
            <Hint key={band} entry={BAND_TIPS[band]}>
            <button
              type="button"
              onClick={() => available && onChange(band)}
              disabled={!available}
              aria-pressed={isSelected}
              className={`inline-flex min-h-11 sm:min-h-9 items-center gap-1.5 rounded-lg border px-3 font-mono text-sm transition-colors ${
                !available
                  ? 'cursor-not-allowed border-sky-border/40 text-sky-inkDim/50'
                  : isSelected
                  ? 'border-sky-accent bg-sky-accent text-sky-bg font-semibold'
                  : 'border-sky-border text-sky-ink hover:border-sky-accent/50'
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: BAND_COLORS[band] }} aria-hidden="true" />
              {band}
              {isDefault && available && <span className="sr-only"> (recommended for this object)</span>}
              {isDefault && available && !isSelected && <span className="text-xs text-sky-accent" aria-hidden="true">★</span>}
            </button>
            </Hint>
          )
        })}
      </div>
      {info && (
        <p className="mt-2 text-sm text-sky-inkDim">
          <span className="font-mono text-sky-ink">{value}</span> · {info.range.replace(' µm', '')} <Term k="micron">µm</Term> · {info.plain}
          {value === defaultBand && <span className="text-sky-accent"> · recommended</span>}
        </p>
      )}
      {saturated && (
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>This star is too bright for the detector at its centre, so the centre is <Term k="saturated">masked</Term>.</span>
        </p>
      )}
    </fieldset>
  )
}
