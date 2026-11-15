'use client'

import React from 'react'
import { MARKER_STYLE } from '@/lib/object-overlay'
import MarkerSwatch from './MarkerSwatch'
import { Term } from '@/components/Term'

const C = 15

/** Key for the canvas markers. Every category differs by shape or dash, not only colour. */
export default function ObjectsLegend() {
  const rows: { key: string; label: React.ReactNode; swatch: React.ReactNode }[] = [
    {
      key: 'target',
      label: <>Where the target <Term k="predictedPosition">should be now</Term></>,
      swatch: (
        <svg width={30} height={30} viewBox="0 0 30 30" className="flex-shrink-0" aria-hidden="true">
          <g stroke="rgba(90,185,252,0.9)" strokeWidth={1.5} strokeDasharray="4 4">
            <line x1={C - 12} y1={C} x2={C - 3} y2={C} />
            <line x1={C + 3} y1={C} x2={C + 12} y2={C} />
            <line x1={C} y1={C - 12} x2={C} y2={C - 3} />
            <line x1={C} y1={C + 3} x2={C} y2={C + 12} />
          </g>
        </svg>
      ),
    },
    { key: 'moving', label: <><Term k="fastMover">Fast mover</Term> (over 1<Term k="arcsecond">″</Term> a year): dashed outer ring</>, swatch: <MarkerSwatch shape="circle" color={MARKER_STYLE.known} moving /> },
    { key: 'known', label: <><Term k="known">Known</Term>: listed in <Term k="catwise">CatWISE</Term>, <Term k="allwise">AllWISE</Term> or <Term k="twomass">2MASS</Term></>, swatch: <MarkerSwatch shape="circle" color={MARKER_STYLE.known} /> },
    { key: 'unidentified', label: <><Term k="unidentified">Unidentified</Term>: in none of those <Term k="catalogue">catalogues</Term></>, swatch: <MarkerSwatch shape="square" color={MARKER_STYLE.unidentified} /> },
    { key: 'selected', label: 'Selected', swatch: <MarkerSwatch shape="circle" color={MARKER_STYLE.known} selected /> },
  ]

  return (
    <ul className="mt-4 grid grid-cols-1 gap-x-4 gap-y-1 text-sm text-sky-inkDim sm:grid-cols-2" aria-label="Marker key">
      {rows.map(r => (
        <li key={r.key} className="flex items-center gap-2" data-legend={r.key}>
          {r.swatch}
          <span>{r.label}</span>
        </li>
      ))}
    </ul>
  )
}
