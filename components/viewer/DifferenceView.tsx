'use client'

import React, { useRef, useEffect, useState } from 'react'
import { Info } from 'lucide-react'
import type { LoadedPlayerFrame, BundleTarget } from '@/lib/bundle-loader'

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

/** Convert grayscale diverging PNG (128=0, >128 positive, <128 negative) to RGBA color. */
function colorizeDivergingPixel(gray: number): [number, number, number, number] {
  const delta = gray - 128
  if (delta > 0) {
    // Positive residual: B > A → target IS here (green)
    const v = Math.min(255, Math.round(delta * 1.8))
    return [30, 180 + Math.round(delta * 0.3), 80, 255]
  } else if (delta < 0) {
    // Negative residual: A > B → target WAS here (orange-red)
    const v = Math.min(255, Math.round(-delta * 1.8))
    return [220 + Math.round(-delta * 0.15), 80 + Math.round(-delta * 0.4), 30, 255]
  }
  return [80, 80, 90, 255]  // neutral grey background
}

const DIPOLE_NOTES: Record<string, { note: string; warn?: boolean }> = {
  'barnards-star': {
    note: "D2 measured 1.54 px dipole vs 1.67 px predicted (comp star residual 0.10 px). Motion is in the PSF wings — saturated core masked.",
    warn: false,
  },
  'eps-indi-b': {
    note: "Epsilon Indi B: moderate proper motion. The 3.3 µm CH₄ spectrum is the primary science product for this target.",
  },
  'wise-0855': {
    note: "WISE 0855: 0.60 px measured in D6 vs 0.64 px predicted (6-month baseline). No comparison star inside the grid.",
    warn: true,
  },
  'rw-aur': {
    note: "RW Aur: variability (not motion) is the signal. D2 saturated core masked. Same-channel flux comparison across visits.",
  },
  'r-dra': {
    note: "R Dra: fully saturated. PSF-wing brightness ratio v1/v3 shown as a variability proxy (systematic floor ±0.3 mag).",
    warn: false,
  },
}

export default function DifferenceView({
  frameA, frameB, target, band, isLoading, displaySize = DISPLAY,
}: DifferenceViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [colorizeDone, setColorizeDone] = useState(false)

  useEffect(() => {
    setColorizeDone(false)
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // We need a diff URL. Use frameB's diffUrl (the diff pair image)
    const diffUrl = frameB?.diffUrl ?? frameA?.diffUrl ?? null
    if (!diffUrl) {
      ctx.fillStyle = '#131824'
      ctx.fillRect(0, 0, displaySize, displaySize)
      ctx.fillStyle = '#8b96a8'
      ctx.font = '11px JetBrains Mono'
      ctx.textAlign = 'center'
      ctx.fillText('No difference image', displaySize / 2, displaySize / 2)
      return
    }

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      // Draw to offscreen canvas to get pixel data
      const offscreen = document.createElement('canvas')
      offscreen.width = 49; offscreen.height = 49
      const octx = offscreen.getContext('2d')!
      octx.drawImage(img, 0, 0, 49, 49)
      const { data } = octx.getImageData(0, 0, 49, 49)

      // Build RGBA colorized output
      const scale = displaySize / 49
      const out = document.createElement('canvas')
      out.width = displaySize; out.height = displaySize
      const oc = out.getContext('2d')!
      const imgData = oc.createImageData(displaySize, displaySize)

      for (let py = 0; py < displaySize; py++) {
        for (let px = 0; px < displaySize; px++) {
          const srcX = Math.floor(px / scale)
          const srcY = Math.floor(py / scale)
          const srcIdx = (srcY * 49 + srcX) * 4
          const gray = data[srcIdx] // grayscale PNG: R=G=B=gray
          const [r, g, b, a] = colorizeDivergingPixel(gray)
          const dstIdx = (py * displaySize + px) * 4
          imgData.data[dstIdx] = r
          imgData.data[dstIdx + 1] = g
          imgData.data[dstIdx + 2] = b
          imgData.data[dstIdx + 3] = a
        }
      }
      oc.putImageData(imgData, 0, 0)

      ctx.drawImage(out, 0, 0)

      // Draw comparison star if available
      if (target?.comparison_star) {
        const cs = target.comparison_star
        const cx = cs.png_x * scale
        const cy = cs.png_y * scale
        ctx.strokeStyle = 'rgba(255,215,0,0.8)'
        ctx.lineWidth = 1
        ctx.setLineDash([3, 3])
        ctx.beginPath()
        ctx.arc(cx, cy, 10, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = 'rgba(255,215,0,0.9)'
        ctx.font = '8px JetBrains Mono'
        ctx.textAlign = 'center'
        ctx.fillText('ctrl', cx, cy - 13)
      }

      // Legend
      ctx.fillStyle = 'rgba(0,0,0,0.7)'
      ctx.fillRect(0, displaySize - 20, displaySize, 20)
      // Green = now (positive)
      ctx.fillStyle = '#4ade80'
      ctx.beginPath(); ctx.arc(10, displaySize - 10, 4, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#e9edf3'
      ctx.font = '9px JetBrains Mono'; ctx.textAlign = 'left'
      ctx.fillText('now', 18, displaySize - 6)
      // Red = was (negative)
      ctx.fillStyle = '#ef4444'
      ctx.beginPath(); ctx.arc(55, displaySize - 10, 4, 0, Math.PI * 2); ctx.fill()
      ctx.fillText('was', 63, displaySize - 6)
      // pair label
      if (frameA && frameB) {
        ctx.fillStyle = '#8b96a8'
        ctx.textAlign = 'right'
        ctx.fillText(`${frameA.visitId}→${frameB.visitId}  ${band}`, displaySize - 4, displaySize - 6)
      }

      setColorizeDone(true)
    }
    img.onerror = () => {
      ctx.fillStyle = '#131824'
      ctx.fillRect(0, 0, displaySize, displaySize)
      ctx.fillStyle = '#ef4444'
      ctx.font = '10px JetBrains Mono'
      ctx.textAlign = 'center'
      ctx.fillText('Diff image failed', displaySize / 2, displaySize / 2)
    }
    img.src = diffUrl
  }, [frameA, frameB, target, band, displaySize])

  if (isLoading) {
    return (
      <div className="rounded-lg overflow-hidden border border-sky-border shimmer"
        style={{ width: displaySize, height: displaySize, maxWidth: '100%' }} />
    )
  }

  const noteInfo = DIPOLE_NOTES[target?.id ?? '']

  return (
    <div>
      <div className="relative rounded-lg overflow-hidden border border-sky-border inline-block max-w-full"
        style={{ background: '#0a0d14' }}>
        <canvas
          ref={canvasRef}
          width={displaySize}
          height={displaySize}
          className="block"
          style={{ imageRendering: 'pixelated', maxWidth: '100%', height: 'auto' }}
        />
        <div className="absolute top-2 right-2 flex gap-1.5">
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-black/60 text-green-400 border border-green-400/30">
            diff B−A
          </span>
        </div>
        {target?.comparison_star && (
          <div className="absolute top-2 left-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-black/60 text-yellow-300/80 border border-yellow-300/20">
              ctrl G={target.comparison_star.G.toFixed(1)}
            </span>
          </div>
        )}
      </div>

      {noteInfo && (
        <div className={`mt-2 flex gap-1.5 text-[11px] leading-snug ${noteInfo.warn ? 'text-yellow-400' : 'text-sky-inkDim'}`}>
          <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{noteInfo.note}</span>
        </div>
      )}
    </div>
  )
}
