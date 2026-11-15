'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { toRgba } from '@/lib/live-fetch'

export interface LiveBlinkFrame {
  key: string
  label: string
  pixels: (number | null)[] | null
  width: number
  height: number
}

interface Props {
  frames: LiveBlinkFrame[]
  stretch: { lo: number; hi: number } | null
}

const FRAME_MS = 500
const DISPLAY_PX = 392

export default function LiveBlink({ frames, stretch }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)

  // Only frames that have pixels are cycled.
  const playable = frames.filter((f) => f.pixels !== null)
  const count = playable.length
  const current = count > 0 ? playable[Math.min(index, count - 1)] : null
  const shownIndex = count > 0 ? Math.min(index, count - 1) : 0

  useEffect(() => {
    if (!playing || count < 2) return
    const id = setInterval(() => setIndex((i) => (i + 1) % count), FRAME_MS)
    return () => clearInterval(id)
  }, [playing, count])

  const allMissing =
    current !== null && current.pixels !== null && current.pixels.every((v) => v === null || !Number.isFinite(v))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !current || !current.pixels) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { width, height, pixels } = current
    if (pixels.length !== width * height) return
    canvas.width = width
    canvas.height = height
    // With no shared stretch (every frame empty) toRgba still paints missing pixels grey.
    const s = stretch ?? { lo: 0, hi: 1 }
    ctx.putImageData(new ImageData(toRgba(pixels, s.lo, s.hi) as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0)
  }, [current, stretch])

  if (!current) {
    return (
      <div className="text-sm text-sky-inkDim" style={{ minHeight: 80 }}>
        No cutouts to blink yet.
      </div>
    )
  }

  return (
    <div>
      <div className="relative inline-block" style={{ width: DISPLAY_PX, maxWidth: '100%' }}>
        <canvas
          ref={canvasRef}
          width={current.width}
          height={current.height}
          className="block w-full rounded border border-sky-border bg-sky-bg"
          style={{ imageRendering: 'pixelated', aspectRatio: '1' }}
        />
        {allMissing && (
          <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-center text-xs text-yellow-400">
            no valid pixels in this cutout
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-3" style={{ maxWidth: DISPLAY_PX }}>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          disabled={count < 2}
          aria-label={playing ? 'Pause' : 'Play'}
          className="rounded border border-sky-border p-1.5 text-sky-ink hover:border-sky-accent/50 disabled:opacity-40"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <span className="font-mono text-xs text-sky-inkDim">
          {shownIndex + 1}/{count}
        </span>
        <span className="truncate font-mono text-xs text-sky-ink">{current.label}</span>
      </div>

      <p className="mt-2 text-xs text-sky-inkDim" style={{ maxWidth: DISPLAY_PX }}>
        Detector orientation, not reprojected: frames from different exposures may be rotated relative to each other.
      </p>
    </div>
  )
}
