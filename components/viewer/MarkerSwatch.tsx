import React from 'react'
import { MARKER_STYLE, type MarkerShape } from '@/lib/object-overlay'

const SIZE = 30
const C = SIZE / 2

interface MarkerSwatchProps {
  shape: MarkerShape
  color: string
  moving?: boolean
  selected?: boolean
}

/** SVG copy of a canvas marker: same radii (1:1), colours, shape and dash. */
export default function MarkerSwatch({ shape, color, moving = false, selected = false }: MarkerSwatchProps) {
  const r = MARKER_STYLE.baseRadius
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="flex-shrink-0" aria-hidden="true">
      {shape === 'circle'
        ? <circle cx={C} cy={C} r={r} fill="none" stroke={color} strokeWidth={MARKER_STYLE.lineWidth} />
        : <rect x={C - r} y={C - r} width={2 * r} height={2 * r} fill="none" stroke={color} strokeWidth={MARKER_STYLE.lineWidth} />}
      {moving && (
        <circle cx={C} cy={C} r={MARKER_STYLE.movingRadius} fill="none" stroke={color}
          strokeWidth={MARKER_STYLE.lineWidth} strokeDasharray={MARKER_STYLE.movingDash.join(' ')} />
      )}
      {selected && (
        <circle cx={C} cy={C} r={MARKER_STYLE.selectedRadius} fill="none" stroke={MARKER_STYLE.selected} strokeWidth={MARKER_STYLE.lineWidth} />
      )}
    </svg>
  )
}
