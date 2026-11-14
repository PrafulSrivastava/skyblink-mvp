'use client'

import React, { useRef, useEffect, useCallback, useState } from 'react'
import { Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react'
import type { LoadedPlayerFrame } from '@/lib/bundle-loader'

interface BlinkPlayerProps {
  frames: LoadedPlayerFrame[]
  isLoading?: boolean
  onFrameChange?: (index: number) => void
  onPixelClick?: () => void
  currentFrame?: number
  showCrosshair?: boolean
  fps?: number
  /** Display size for the canvas; images are 49×49 and upscaled */
  displaySize?: number
}

const DISPLAY = 294   // 49 × 6 — sharp integer multiple

export default function BlinkPlayer({
  frames,
  isLoading,
  onFrameChange,
  onPixelClick,
  currentFrame: externalFrame,
  showCrosshair = true,
  fps = 2,
  displaySize = DISPLAY,
}: BlinkPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [playing, setPlaying] = useState(true)
  const [internalFrame, setInternalFrame] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())

  const currentIndex = externalFrame ?? internalFrame
  const frame = frames[currentIndex]
  const scale = displaySize / 49

  const preload = useCallback(() => {
    frames.forEach(f => {
      if (!imgCacheRef.current.has(f.imageUrl)) {
        const img = new Image()
        img.src = f.imageUrl
        imgCacheRef.current.set(f.imageUrl, img)
      }
    })
  }, [frames])

  useEffect(() => { preload() }, [preload])

  const draw = useCallback((idx: number) => {
    const canvas = canvasRef.current
    if (!canvas || !frames[idx]) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const f = frames[idx]
    const img = imgCacheRef.current.get(f.imageUrl)

    ctx.clearRect(0, 0, displaySize, displaySize)
    ctx.fillStyle = '#0a0d14'
    ctx.fillRect(0, 0, displaySize, displaySize)

    if (img?.complete && img.naturalWidth > 0) {
      // pixelated upscale — disable smoothing
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, 0, 0, displaySize, displaySize)
    } else {
      ctx.fillStyle = '#1a2030'
      ctx.fillRect(0, 0, displaySize, displaySize)
      ctx.fillStyle = '#8b96a8'
      ctx.font = `${12}px JetBrains Mono, monospace`
      ctx.textAlign = 'center'
      ctx.fillText('Loading…', displaySize / 2, displaySize / 2)
    }

    // Crosshair at PM-corrected predicted position
    if (showCrosshair && f.targetPng) {
      const cx = f.targetPng.png_x * scale
      const cy = f.targetPng.png_y * scale

      // Dashed reticle
      ctx.strokeStyle = 'rgba(90,185,252,0.9)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      const arm = 14
      const gap = 5
      ctx.beginPath()
      ctx.moveTo(cx - arm, cy); ctx.lineTo(cx - gap, cy)
      ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + arm, cy)
      ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy - gap)
      ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + arm)
      ctx.stroke()
      ctx.setLineDash([])

      // Ring
      ctx.beginPath()
      ctx.arc(cx, cy, 10, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(90,185,252,0.5)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // Comparison star marker (orange circle)
    // We don't have it per-frame but it's same for all frames; skip unless passed

    // HUD: date, band, visit type, partial warning
    const hud = `${f.dateStart}  ${f.band}  ${f.visitType === 'partial' ? '⚠ partial' : ''}`
    ctx.fillStyle = 'rgba(0,0,0,0.65)'
    ctx.fillRect(0, displaySize - 20, displaySize, 20)
    ctx.fillStyle = '#e9edf3'
    ctx.font = `${10}px JetBrains Mono, monospace`
    ctx.textAlign = 'left'
    ctx.fillText(hud, 5, displaySize - 6)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#8b96a8'
    ctx.fillText(`${idx + 1}/${frames.length}`, displaySize - 5, displaySize - 6)
  }, [frames, showCrosshair, scale, displaySize])

  useEffect(() => { draw(currentIndex) }, [draw, currentIndex])

  useEffect(() => {
    if (!playing || frames.length <= 1) return
    intervalRef.current = setInterval(() => {
      setInternalFrame(prev => {
        const next = (prev + 1) % frames.length
        onFrameChange?.(next)
        return next
      })
    }, 1000 / fps)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [playing, frames.length, fps, onFrameChange])

  const step = (d: number) => {
    const next = (currentIndex + d + frames.length) % frames.length
    setInternalFrame(next); onFrameChange?.(next)
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-sky-border overflow-hidden shimmer"
        style={{ width: displaySize, height: displaySize, maxWidth: '100%' }} />
    )
  }

  if (!frames.length) {
    return (
      <div className="rounded-lg border border-sky-border bg-sky-surface flex items-center justify-center"
        style={{ width: displaySize, height: displaySize, maxWidth: '100%' }}>
        <span className="text-sky-inkDim text-sm">Pick a target above</span>
      </div>
    )
  }

  return (
    <div className="select-none">
      <div className="relative rounded-lg overflow-hidden border border-sky-border inline-block max-w-full"
        style={{ background: '#0a0d14' }}>
        <canvas
          ref={canvasRef}
          width={displaySize}
          height={displaySize}
          className="block cursor-crosshair"
          style={{ imageRendering: 'pixelated', maxWidth: '100%', height: 'auto' }}
          onClick={() => onPixelClick?.()}
        />
        {/* Band badge */}
        {frame && (
          <div className="absolute top-2 left-2 flex gap-1.5">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-black/60 text-sky-accent border border-sky-accent/30">
              {frame.band}
            </span>
            {frame.visitType === 'partial' && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-black/60 text-yellow-400 border border-yellow-400/30">
                partial
              </span>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="mt-2 flex items-center gap-2" style={{ maxWidth: displaySize }}>
        <input
          type="range" min={0} max={frames.length - 1} value={currentIndex}
          onChange={e => { const v = +e.target.value; setInternalFrame(v); onFrameChange?.(v) }}
          className="flex-1 h-1 rounded accent-sky-accent"
        />
        <button onClick={() => step(-1)} className="p-1.5 rounded text-sky-inkDim hover:text-sky-ink">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button onClick={() => setPlaying(p => !p)}
          className="p-1.5 rounded bg-sky-accent/10 text-sky-accent hover:bg-sky-accent/20">
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button onClick={() => step(1)} className="p-1.5 rounded text-sky-inkDim hover:text-sky-ink">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Visit date strip */}
      <div className="mt-1 flex gap-1 flex-wrap" style={{ maxWidth: displaySize }}>
        {frames.map((f, i) => (
          <button
            key={f.visitId + f.band}
            onClick={() => { setInternalFrame(i); onFrameChange?.(i) }}
            title={`${f.dateStart} – ${f.dateEnd}  (${f.nCoadded} co-adds)`}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
              i === currentIndex
                ? 'bg-sky-accent/20 text-sky-accent border border-sky-accent/40'
                : 'text-sky-inkDim border border-sky-border hover:text-sky-ink'
            } ${f.visitType === 'partial' ? 'opacity-70' : ''}`}
          >
            {f.visitId}
          </button>
        ))}
      </div>
    </div>
  )
}
