'use client'

import React from 'react'
import { MARKER_STYLE } from '@/lib/object-overlay'

const SIZE = 30
const C = SIZE / 2

/** One legend swatch: same radii (1:1), colours and dash as the canvas markers. */
function Swatch({ children }: { children: React.ReactNode }) {
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="flex-shrink-0" aria-hidden="true">
      {children}
    </svg>
  )
}

const ring = (r: number, color: string, dash?: readonly number[]) => (
  <circle
    cx={C}
    cy={C}
    r={r}
    fill="none"
    stroke={color}
    strokeWidth={MARKER_STYLE.lineWidth}
    strokeDasharray={dash ? dash.join(' ') : undefined}
  />
)

export default function ObjectsLegend() {
  const rows: { key: string; label: string; swatch: React.ReactNode }[] = [
    { key: 'known', label: 'Known (catalog match)', swatch: ring(MARKER_STYLE.baseRadius, MARKER_STYLE.known) },
    {
      key: 'unidentified',
      label: 'Unidentified (no CatWISE/AllWISE/2MASS match)',
      swatch: ring(MARKER_STYLE.baseRadius, MARKER_STYLE.unidentified),
    },
    {
      key: 'moving',
      label: 'High proper motion (≥ 1000 mas/yr, or image shift)',
      swatch: (
        <>
          {ring(MARKER_STYLE.baseRadius, MARKER_STYLE.known)}
          {ring(MARKER_STYLE.movingRadius, MARKER_STYLE.known, MARKER_STYLE.movingDash)}
        </>
      ),
    },
    { key: 'selected', label: 'Selected', swatch: ring(MARKER_STYLE.selectedRadius, MARKER_STYLE.selected) },
    {
      key: 'target',
      label: 'Predicted target position',
      swatch: (
        <g stroke="rgba(90,185,252,0.9)" strokeWidth={1.5} strokeDasharray="4 4">
          <line x1={C - 12} y1={C} x2={C - 3} y2={C} />
          <line x1={C + 3} y1={C} x2={C + 12} y2={C} />
          <line x1={C} y1={C - 12} x2={C} y2={C - 3} />
          <line x1={C} y1={C + 3} x2={C} y2={C + 12} />
        </g>
      ),
    },
  ]

  return (
    <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-sky-inkDim" aria-label="Marker legend">
      {rows.map(r => (
        <li key={r.key} className="flex items-center gap-2" data-legend={r.key}>
          <Swatch>{r.swatch}</Swatch>
          <span>{r.label}</span>
        </li>
      ))}
    </ul>
  )
}
