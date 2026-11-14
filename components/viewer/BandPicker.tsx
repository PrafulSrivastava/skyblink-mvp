'use client'

import React from 'react'

const BAND_RANGES: Record<string, string> = {
  D1: '0.75–1.09 µm',
  D2: '1.10–1.62 µm',
  D3: '1.63–2.42 µm',
  D4: '2.42–3.82 µm',
  D5: '3.82–4.42 µm',
  D6: '4.42–5.00 µm',
}

const BAND_COLORS: Record<string, string> = {
  D1: '#7c6fcd', D2: '#5ab9fc', D3: '#4ade80',
  D4: '#ffd700', D5: '#f97316', D6: '#ef4444',
}

interface BandPickerProps {
  value: string
  onChange: (band: string) => void
  availableBands: string[]
  defaultBand?: string
  saturated?: boolean
}

export default function BandPicker({ value, onChange, availableBands, defaultBand, saturated }: BandPickerProps) {
  return (
    <div>
      <div className="text-sky-inkDim text-[10px] font-mono uppercase tracking-wider mb-2">
        Detector band
        {saturated && <span className="ml-2 text-yellow-400">⚠ saturated cores masked in image</span>}
      </div>
      <div className="flex gap-1 flex-wrap">
        {(['D1','D2','D3','D4','D5','D6'] as const).map(band => {
          const available = availableBands.includes(band)
          const isSelected = value === band
          const isDefault = band === defaultBand
          const color = BAND_COLORS[band]

          return (
            <button
              key={band}
              onClick={() => available && onChange(band)}
              disabled={!available}
              title={BAND_RANGES[band]}
              className={`px-2 py-1 rounded text-[11px] font-mono transition-all ${
                !available
                  ? 'text-sky-inkDim/30 border border-sky-border/30 cursor-not-allowed'
                  : isSelected
                  ? 'text-sky-bg font-semibold'
                  : 'text-sky-inkDim border border-sky-border hover:border-sky-accent/50 hover:text-sky-ink'
              }`}
              style={isSelected ? { backgroundColor: color, borderColor: color } : {}}
            >
              {band}
              {isDefault && !isSelected && available && (
                <span className="ml-0.5 text-[8px] opacity-60">★</span>
              )}
            </button>
          )
        })}
      </div>
      {value && BAND_RANGES[value] && (
        <div className="mt-1 text-[10px] text-sky-inkDim font-mono">{BAND_RANGES[value]}</div>
      )}
    </div>
  )
}
