/**
 * Pure geometry, hit test and style constants for the sky-objects markers drawn on the
 * Blink canvas. No DOM access here so Node can run it (scripts/check-sky-objects.mjs).
 *
 * Erasable TypeScript only and `import type` only, so Node can strip the types.
 *
 * Coordinate convention: a marker sits on the pixel centre, (png_x + 0.5) * scale.
 */
import type { PixelPos, SkyObject } from './sky-objects'

export const MARKER_STYLE = {
  known: '#34d399',
  unidentified: '#f472b6',
  selected: '#ffffff',
  baseRadius: 6,
  movingRadius: 10,
  selectedRadius: 13,
  lineWidth: 1.5,
  movingDash: [3, 2],
} as const

/** Click tolerance in canvas pixels. */
export const HIT_RADIUS_CANVAS_PX = 9

export function imageToCanvas(p: PixelPos, scale: number): { x: number; y: number } {
  return { x: (p.png_x + 0.5) * scale, y: (p.png_y + 0.5) * scale }
}

export function canvasToImage(x: number, y: number, scale: number): PixelPos {
  return { png_x: x / scale - 0.5, png_y: y / scale - 0.5 }
}

/** Map a pointer position (CSS px) to canvas-bitmap px; handles a canvas shrunk by CSS. */
export function clientToCanvas(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  return {
    x: (clientX - rect.left) * (canvasWidth / rect.width),
    y: (clientY - rect.top) * (canvasHeight / rect.height),
  }
}

export interface MarkerGeometry {
  id: string
  cx: number
  cy: number
  r: number
  color: string
  movingRingR: number | null
  selected: boolean
}

/** Marker for one object in one visit; null when the object has no position for that visit. */
export function markerGeometry(
  obj: SkyObject,
  visitId: string,
  scale: number,
  selectedId: string | null,
): MarkerGeometry | null {
  const pos = obj.positions[visitId] as PixelPos | undefined
  if (!pos) return null
  const { x, y } = imageToCanvas(pos, scale)
  return {
    id: obj.id,
    cx: x,
    cy: y,
    r: MARKER_STYLE.baseRadius,
    color: obj.kind === 'known' ? MARKER_STYLE.known : MARKER_STYLE.unidentified,
    movingRingR: obj.moving ? MARKER_STYLE.movingRadius : null,
    selected: obj.id === selectedId,
  }
}

/**
 * Id of the marker whose centre is nearest the click and within radiusPx, else null.
 * Equal distances go to the higher snr (null snr ranks lowest).
 */
export function hitTest(
  objects: readonly SkyObject[],
  visitId: string,
  canvasX: number,
  canvasY: number,
  scale: number,
  radiusPx: number = HIT_RADIUS_CANVAS_PX,
): string | null {
  let bestId: string | null = null
  let bestDist = Infinity
  let bestSnr = -Infinity
  for (const o of objects) {
    const pos = o.positions[visitId] as PixelPos | undefined
    if (!pos) continue
    const c = imageToCanvas(pos, scale)
    const d = Math.hypot(c.x - canvasX, c.y - canvasY)
    if (d > radiusPx) continue
    const snr = o.snr ?? -Infinity
    if (d < bestDist - 1e-9 || (Math.abs(d - bestDist) <= 1e-9 && snr > bestSnr)) {
      bestId = o.id
      bestDist = d
      bestSnr = snr
    }
  }
  return bestId
}
