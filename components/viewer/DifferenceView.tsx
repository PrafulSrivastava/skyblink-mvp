'use client'

import React, { useRef, useEffect } from 'react'
import { Info, AlertTriangle } from 'lucide-react'
import type { LoadedPlayerFrame, BundleTarget } from '@/lib/bundle-loader'
import { formatMonth } from '@/lib/long-baseline'
import { RichText, Term } from '@/components/Term'

interface DifferenceViewProps {
  /** First frame of the diff pair (reference) */
  frameA: LoadedPlayerFrame | null
  /** Last frame of the diff pair */
  frameB: LoadedPlayerFrame | null
  target: BundleTarget | null
  band: string
  isLoading?: boolean
  displaySize?: number
}

const DISPLAY = 294

// Blue/orange diverging map: safe for red-green colour blindness, and small residuals stay dark
// so only real changes stand out.
const NEUTRAL: [number, number, number] = [16, 20, 30]
const NOW_RGB: [number, number, number] = [251, 146, 60]  // orange: brighter now (B > A)
const WAS_RGB: [number, number, number] = [96, 165, 250]  // blue: brighter before (A > B)
const NOW_HEX = '#fb923c'
const WAS_HEX = '#60a5fa'

/** Grayscale diverging PNG (128 = no change) to RGBA. */
function colorizeDivergingPixel(gray: number): [number, number, number, number] {
  const delta = gray - 128
  const end = delta >= 0 ? NOW_RGB : WAS_RGB
  const t = Math.min(1, Math.abs(delta) / 72) ** 0.8
  return [
    Math.round(NEUTRAL[0] + (end[0] - NEUTRAL[0]) * t),
    Math.round(NEUTRAL[1] + (end[1] - NEUTRAL[1]) * t),
    Math.round(NEUTRAL[2] + (end[2] - NEUTRAL[2]) * t),
    255,
  ]
}

const DIPOLE_NOTES: Record<string, { plain: string; note: string; warn?: boolean }> = {
  'barnards-star': {
    plain: 'Look for a blue and orange pair at the crosshair: the star has slid from the blue side to the orange side.',
    note: '[[Band|band]] D2 [[measured|measuredShift]] 1.54 px shift vs 1.67 px [[predicted|predictedShift]] ([[comparison star|comparisonStar]] moved 0.10 px). The motion is measured in the star’s [[outer glow|psfWing]] because the [[saturated|saturated]] centre is masked.',
  },
  'eps-indi-b': {
    plain: 'A small shift over a few months. This target is better known for its [[spectrum|spectrum]]: open Spectrum.',
    note: 'Moderate [[proper motion|properMotion]]. The 3.3 [[µm|micron]] [[CH₄|methane]] spectrum is the main science result for this target.',
  },
  'wise-0855': {
    plain: 'Faint and only six months apart, so the shift is under one pixel. The [[16-year view|longBaseline]] shows its motion far more clearly.',
    note: '0.60 px [[measured|measuredShift]] in [[band|band]] D6 vs 0.64 px [[predicted|predictedShift]] (6 months apart). No [[comparison star|comparisonStar]] inside the image.',
    warn: true,
  },
  'rw-aur': {
    plain: 'Colour here means a change in brightness, not motion: this young star flickers.',
    note: '[[Band|band]] D2 [[saturated|saturated]] core masked. Same-[[channel|channel]] brightness compared across [[visits|visit]].',
  },
  'r-dra': {
    plain: 'Colour here means a change in brightness, not motion: this giant star pulses.',
    note: 'Fully [[saturated|saturated]]. The [[PSF-wing|psfWing]] brightness ratio between [[visits|visit]] tracks its variability (±0.3 [[mag|magnitude]] floor).',
  },
}

export default function DifferenceView({
  frameA, frameB, target, band, isLoading, displaySize = DISPLAY,
}: DifferenceViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const message = (text: string, color = '#8b96a8') => {
      ctx.fillStyle = '#131824'
      ctx.fillRect(0, 0, displaySize, displaySize)
      ctx.fillStyle = color
      ctx.font = '14px Manrope, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(text, displaySize / 2, displaySize / 2)
    }

    const diffUrl = frameB?.diffUrl ?? frameA?.diffUrl ?? null
    if (!diffUrl) { message('No difference image for this band'); return }

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const offscreen = document.createElement('canvas')
      offscreen.width = 49; offscreen.height = 49
      const octx = offscreen.getContext('2d')!
      octx.drawImage(img, 0, 0, 49, 49)
      const { data } = octx.getImageData(0, 0, 49, 49)

      const scale = displaySize / 49
      const imgData = ctx.createImageData(displaySize, displaySize)
      for (let py = 0; py < displaySize; py++) {
        for (let px = 0; px < displaySize; px++) {
          const src = (Math.floor(py / scale) * 49 + Math.floor(px / scale)) * 4
          const [r, g, b, a] = colorizeDivergingPixel(data[src])
          const dst = (py * displaySize + px) * 4
          imgData.data[dst] = r; imgData.data[dst + 1] = g; imgData.data[dst + 2] = b; imgData.data[dst + 3] = a
        }
      }
      ctx.putImageData(imgData, 0, 0)

      // Comparison star: should show no pair, which is what makes the target's pair believable
      if (target?.comparison_star) {
        const cs = target.comparison_star
        ctx.strokeStyle = 'rgba(233,237,243,0.85)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([3, 3])
        ctx.beginPath()
        ctx.arc((cs.png_x + 0.5) * scale, (cs.png_y + 0.5) * scale, 12, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }
    img.onerror = () => message('Difference image failed to load', '#fca5a5')
    img.src = diffUrl
  }, [frameA, frameB, target, displaySize])

  if (isLoading) {
    return <div className="aspect-square w-full rounded-lg border border-sky-border shimmer" style={{ maxWidth: displaySize }} role="status" aria-label="Loading" />
  }

  const noteInfo = DIPOLE_NOTES[target?.id ?? '']
  const pairLabel = frameA && frameB ? `${formatMonth(frameB.dateStart)} minus ${formatMonth(frameA.dateStart)}` : 'later minus earlier'

  return (
    <div style={{ maxWidth: displaySize }}>
      <div className="relative overflow-hidden rounded-lg border border-sky-border bg-sky-bg">
        <canvas
          ref={canvasRef}
          width={displaySize}
          height={displaySize}
          role="img"
          aria-label={`Difference image, ${pairLabel}, band ${band}. Orange is brighter now, blue was brighter before.${target?.comparison_star ? ' A dashed ring marks a comparison star that should not change.' : ''}`}
          className="block h-auto w-full"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>

      {/* Key as real text */}
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-sky-inkDim" aria-label="Difference colour key">
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: NOW_HEX }} aria-hidden="true" />Brighter now</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: WAS_HEX }} aria-hidden="true" />Brighter before</li>
        {target?.comparison_star && (
          <li className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border border-dashed border-sky-ink" aria-hidden="true" />
            <span><Term k="comparisonStar">Comparison star</Term> (<Term k="gMag">Gaia G</Term> = {target.comparison_star.G.toFixed(1)})</span>
          </li>
        )}
      </ul>

      {noteInfo && (
        <div className="mt-3 space-y-1.5 text-sm">
          <p className={`flex gap-1.5 ${noteInfo.warn ? 'text-amber-200' : 'text-sky-ink'}`}>
            {noteInfo.warn
              ? <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              : <Info className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />}
            <span><RichText text={noteInfo.plain} /></span>
          </p>
          <p className="text-xs text-sky-inkDim"><RichText text={noteInfo.note} /></p>
        </div>
      )}
    </div>
  )
}
