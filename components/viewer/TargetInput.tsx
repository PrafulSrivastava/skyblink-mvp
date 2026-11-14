'use client'

import React, { useState } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { TARGETS } from '@/lib/targets'

const TARGET_CHIPS = [
  { id: 'barnards-star', label: "Barnard's Star", hint: '10″/yr fastest mover' },
  { id: 'epsilon-indi-b', label: 'ε Indi B', hint: 'T-dwarf CH₄ spectrum' },
  { id: 'wise-0855', label: 'WISE 0855', hint: 'Coldest brown dwarf' },
  { id: 'rw-aurigae', label: 'RW Aur', hint: 'T Tauri variable' },
  { id: 'r-draconis', label: 'R Dra', hint: 'Mira variable' },
]

interface TargetInputProps {
  onSearch: (query: { type: 'coords'; ra: number; dec: number } | { type: 'target'; targetId: string }) => void
  isLoading?: boolean
  error?: string
}

export default function TargetInput({ onSearch, isLoading, error }: TargetInputProps) {
  const [ra, setRa] = useState('')
  const [dec, setDec] = useState('')
  const [inputError, setInputError] = useState('')

  function parseRA(s: string): number | null {
    const trimmed = s.trim()
    const decimal = parseFloat(trimmed)
    if (!isNaN(decimal) && !trimmed.includes(':') && !trimmed.includes('h')) return decimal
    
    const sexMatch = trimmed.match(/^(\d+)[h:](\d+)[m:](\d+\.?\d*)[s]?$/)
    if (sexMatch) {
      const h = parseFloat(sexMatch[1])
      const m = parseFloat(sexMatch[2])
      const s = parseFloat(sexMatch[3])
      return (h + m / 60 + s / 3600) * 15
    }
    return null
  }

  function parseDec(s: string): number | null {
    const trimmed = s.trim()
    const decimal = parseFloat(trimmed)
    if (!isNaN(decimal) && !trimmed.includes(':') && !trimmed.includes('d')) return decimal
    
    const sexMatch = trimmed.match(/^([+-]?\d+)[d°:](\d+)[m':](\d+\.?\d*)[s"]?$/)
    if (sexMatch) {
      const sign = sexMatch[1].startsWith('-') ? -1 : 1
      const d = Math.abs(parseFloat(sexMatch[1]))
      const m = parseFloat(sexMatch[2])
      const sv = parseFloat(sexMatch[3])
      return sign * (d + m / 60 + sv / 3600)
    }
    return null
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setInputError('')
    
    if (!ra.trim() || !dec.trim()) {
      setInputError('Enter both RA and Dec')
      return
    }
    
    const raVal = parseRA(ra)
    const decVal = parseDec(dec)
    
    if (raVal === null) {
      setInputError('Invalid RA (use decimal degrees or HH:MM:SS)')
      return
    }
    if (decVal === null) {
      setInputError('Invalid Dec (use decimal degrees or DD:MM:SS)')
      return
    }
    if (raVal < 0 || raVal >= 360) {
      setInputError('RA must be 0–360°')
      return
    }
    if (decVal < -90 || decVal > 90) {
      setInputError('Dec must be -90–+90°')
      return
    }
    
    onSearch({ type: 'coords', ra: raVal, dec: decVal })
  }

  return (
    <div className="space-y-3">
      {/* Target chips */}
      <div>
        <div className="text-sky-inkDim text-[10px] font-mono uppercase tracking-wider mb-2">
          Quick targets
        </div>
        <div className="flex gap-2 flex-wrap">
          {TARGET_CHIPS.map(chip => (
            <button
              key={chip.id}
              onClick={() => onSearch({ type: 'target', targetId: chip.id })}
              disabled={isLoading}
              title={chip.hint}
              className="group px-3 py-1.5 rounded-full border border-sky-border bg-sky-surface hover:bg-sky-surface2 hover:border-sky-accent/50 transition-all disabled:opacity-50"
            >
              <span className="text-xs text-sky-ink group-hover:text-sky-accent transition-colors">
                {chip.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Coordinate input */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="text-sky-inkDim text-[10px] font-mono uppercase tracking-wider">
          Custom coordinates
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <input
              type="text"
              placeholder="RA  08h55m10.8s or 133.794"
              value={ra}
              onChange={e => setRa(e.target.value)}
              className="w-full px-3 py-2 rounded bg-sky-surface border border-sky-border text-sky-ink text-xs font-mono placeholder-sky-inkDim/50 focus:outline-none focus:border-sky-accent/60 transition-colors"
            />
          </div>
          <div className="flex-1">
            <input
              type="text"
              placeholder="Dec  -07d14m43s or -7.245"
              value={dec}
              onChange={e => setDec(e.target.value)}
              className="w-full px-3 py-2 rounded bg-sky-surface border border-sky-border text-sky-ink text-xs font-mono placeholder-sky-inkDim/50 focus:outline-none focus:border-sky-accent/60 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 rounded bg-sky-accent text-sky-bg font-semibold text-sm hover:bg-sky-accent/90 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </button>
        </div>
        
        {(inputError || error) && (
          <div className="text-red-400 text-xs font-mono">
            {inputError || error}
          </div>
        )}
      </form>
    </div>
  )
}
