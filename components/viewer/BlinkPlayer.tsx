'use client'

import React, { useRef, useEffect, useCallback, useState } from 'react'
import { Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react'
import type { LoadedPlayerFrame } from '@/lib/bundle-loader'
import type { SkyObject } from '@/lib/sky-objects'
import {
  MARKER_STYLE, markerGeometry, hitTest, clientToCanvas, canvasToImage,
} from '@/lib/object-overlay'
import { formatMonth } from '@/lib/long-baseline'
import { prefersReducedMotion } from '@/lib/use-reduced-motion'
import { Hint } from '@/components/Term'

export interface PixelClick {
  png_x: number
  png_y: number
  visitId: string
  /** Id of the marker under the click, or null for empty sky (or when no markers are drawn) */
  objectId: string | null
}

interface BlinkPlayerProps {
  frames: LoadedPlayerFrame[]
  isLoading?: boolean
  onFrameChange?: (index: number) => void
  onPixelClick?: (click: PixelClick) => void
  currentFrame?: number
  showCrosshair?: boolean
  /** Sky objects to mark on each frame (already filtered by the marker mode) */
  objects?: readonly SkyObject[]
  selectedObjectId?: string | null
  fps?: number
  /** Canvas bitmap size; images are 49×49 and upscaled by an integer factor */
  displaySize?: number
  /** Single still frame: no controls, no autoplay */
  still?: boolean
  /** Name used in the image description */
  label?: string
}

const DISPLAY = 441 // 49 × 9, sharp integer multiple

const ctrlBtn = 'inline-flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-lg transition-colors'

export default function BlinkPlayer({
  frames,
  isLoading,
  onFrameChange,
  onPixelClick,
  currentFrame: externalFrame,
  showCrosshair = true,
  objects,
  selectedObjectId = null,
  fps = 2,
  displaySize = DISPLAY,
  still = false,
  label = 'Sky patch',
}: BlinkPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Respect "reduce motion": start paused; the visitor can still press play
  const [playing, setPlaying] = useState(() => !still && !prefersReducedMotion())
  const [internalFrame, setInternalFrame] = useState(0)
  const [imagesReady, setImagesReady] = useState(0)
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())

  const currentIndex = Math.min(externalFrame ?? internalFrame, Math.max(0, frames.length - 1))
  const frame = frames[currentIndex]
  const scale = displaySize / 49

  useEffect(() => {
    frames.forEach(f => {
      if (!imgCacheRef.current.has(f.imageUrl)) {
        const img = new Image()
        img.onload = () => setImagesReady(n => n + 1)
        img.src = f.imageUrl
        imgCacheRef.current.set(f.imageUrl, img)
      }
    })
  }, [frames])

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
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, 0, 0, displaySize, displaySize)
    } else {
      ctx.fillStyle = '#1a2030'
      ctx.fillRect(0, 0, displaySize, displaySize)
      ctx.fillStyle = '#8b96a8'
      ctx.font = '14px Manrope, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Loading…', displaySize / 2, displaySize / 2)
    }

    // Crosshair at the motion-corrected predicted position
    if (showCrosshair && f.targetPng) {
      const cx = (f.targetPng.png_x + 0.5) * scale
      const cy = (f.targetPng.png_y + 0.5) * scale
      ctx.strokeStyle = 'rgba(90,185,252,0.95)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      const arm = 16
      const gap = 6
      ctx.beginPath()
      ctx.moveTo(cx - arm, cy); ctx.lineTo(cx - gap, cy)
      ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + arm, cy)
      ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy - gap)
      ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + arm)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Sky-object markers for this frame's visit: circle = known, square = unidentified
    if (objects?.length) {
      ctx.lineWidth = MARKER_STYLE.lineWidth
      for (const obj of objects) {
        const g = markerGeometry(obj, f.visitId, scale, selectedObjectId)
        if (!g) continue
        ctx.strokeStyle = g.color
        ctx.beginPath()
        if (g.shape === 'square') ctx.rect(g.cx - g.r, g.cy - g.r, 2 * g.r, 2 * g.r)
        else ctx.arc(g.cx, g.cy, g.r, 0, Math.PI * 2)
        ctx.stroke()
        if (g.movingRingR !== null) {
          ctx.setLineDash([...MARKER_STYLE.movingDash])
          ctx.beginPath()
          ctx.arc(g.cx, g.cy, g.movingRingR, 0, Math.PI * 2)
          ctx.stroke()
          ctx.setLineDash([])
        }
        if (g.selected) {
          ctx.strokeStyle = MARKER_STYLE.selected
          ctx.beginPath()
          ctx.arc(g.cx, g.cy, MARKER_STYLE.selectedRadius, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
    }
  }, [frames, showCrosshair, scale, displaySize, objects, selectedObjectId])

  useEffect(() => { draw(currentIndex) }, [draw, currentIndex, imagesReady])

  const goTo = useCallback((i: number) => setInternalFrame(i), [])

  useEffect(() => {
    if (still || !playing || frames.length <= 1) return
    const t = setInterval(() => setInternalFrame(prev => (prev + 1) % frames.length), 1000 / fps)
    return () => clearInterval(t)
  }, [still, playing, frames.length, fps])

  // Tell the page which frame is showing. Not from inside the state updater: updaters run during
  // render, and setting the page's state there is the "update while rendering" error.
  useEffect(() => { onFrameChange?.(internalFrame) }, [internalFrame, onFrameChange])

  const step = (d: number) => {
    setPlaying(false)
    goTo((currentIndex + d + frames.length) % frames.length)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (still) return
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); setPlaying(p => !p) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1) }
  }

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget
    const f = frames[currentIndex]
    if (!f) return
    const { x, y } = clientToCanvas(e.clientX, e.clientY, canvas.getBoundingClientRect(), canvas.width, canvas.height)
    const { png_x, png_y } = canvasToImage(x, y, scale)
    const objectId = objects?.length ? hitTest(objects, f.visitId, x, y, scale) : null
    onPixelClick?.({ png_x, png_y, visitId: f.visitId, objectId })
  }

  if (isLoading) {
    return (
      <div className="aspect-square w-full rounded-lg border border-sky-border shimmer" style={{ maxWidth: displaySize }}
        role="status" aria-label="Loading images" />
    )
  }

  if (!frames.length) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-sky-border bg-sky-surface" style={{ maxWidth: displaySize }}>
        <span className="text-sm text-sky-inkDim">No images in this band</span>
      </div>
    )
  }

  const when = frame ? `${formatMonth(frame.dateStart)}${frame.visitType === 'partial' ? ', partial visit' : ''}` : ''
  const description = `${label}, band ${frame?.band}, ${when}. Image ${currentIndex + 1} of ${frames.length}.`

  return (
    <div className="select-none" style={{ maxWidth: displaySize }}>
      <div
        className="relative overflow-hidden rounded-lg border border-sky-border bg-sky-bg"
        tabIndex={still ? undefined : 0}
        onKeyDown={onKeyDown}
        aria-label={still ? undefined : 'Blink player. Space plays or pauses, arrow keys step.'}
        role={still ? undefined : 'group'}
      >
        <canvas
          ref={canvasRef}
          width={displaySize}
          height={displaySize}
          role="img"
          aria-label={description}
          className="block h-auto w-full cursor-crosshair"
          style={{ imageRendering: 'pixelated' }}
          onClick={handleCanvasClick}
        />
        {/* Frame caption as real text, not pixels */}
        {frame && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-black/70 px-2.5 py-1.5 text-sm">
            <span className="text-sky-ink">
              <span className="font-semibold">{formatMonth(frame.dateStart)}</span>
              <span className="text-sky-inkDim"> · band {frame.band}</span>
              {frame.visitType === 'partial' && <span className="text-amber-300"> · partial visit</span>}
            </span>
            {!still && <span className="font-mono text-xs text-sky-inkDim">{currentIndex + 1}/{frames.length}</span>}
          </div>
        )}
      </div>

      {/* Announce the frame when the visitor steps, not on every autoplay tick */}
      <p className="sr-only" aria-live="polite">{!playing && !still ? when : ''}</p>

      {!still && (
        <>
          <div className="mt-2 flex items-center gap-1.5">
            <button type="button" onClick={() => step(-1)} aria-label="Previous image" className={`${ctrlBtn} text-sky-inkDim hover:text-sky-ink hover:bg-sky-surface2`}>
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause blink' : 'Play blink'}
              className={`${ctrlBtn} bg-sky-accent/15 text-sky-accent hover:bg-sky-accent/25`}>
              {playing ? <Pause className="h-5 w-5" aria-hidden="true" /> : <Play className="h-5 w-5" aria-hidden="true" />}
            </button>
            <button type="button" onClick={() => step(1)} aria-label="Next image" className={`${ctrlBtn} text-sky-inkDim hover:text-sky-ink hover:bg-sky-surface2`}>
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
            <input
              type="range" min={0} max={frames.length - 1} value={currentIndex}
              aria-label="Image in the sequence"
              aria-valuetext={when}
              onChange={e => { setPlaying(false); goTo(+e.target.value) }}
              className="ml-1 h-11 sm:h-9 flex-1 accent-sky-accent"
            />
          </div>

          {/* Visits, labelled by date */}
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Jump to a visit">
            {frames.map((f, i) => (
              <Hint key={f.visitId + f.band} entry={{
                term: `${f.visitType === 'partial' ? 'Partial visit' : 'Visit'} · ${formatMonth(f.dateStart)}`,
                def: `${f.dateStart} to ${f.dateEnd}. ${f.nCoadded} frame${f.nCoadded === 1 ? '' : 's'} stacked into one picture.${f.visitType === 'partial' ? ' A partial visit has only a few frames of this spot, so it is noisier.' : ''}`,
              }}>
              <button
                type="button"
                onClick={() => { setPlaying(false); goTo(i) }}
                aria-pressed={i === currentIndex}
                className={`min-h-11 sm:min-h-8 rounded-md border px-2.5 text-xs transition-colors ${
                  i === currentIndex
                    ? 'border-sky-accent/50 bg-sky-accent/15 text-sky-accent'
                    : 'border-sky-border text-sky-ink hover:border-sky-accent/40'
                }`}
              >
                {formatMonth(f.dateStart)}
                {f.visitType === 'partial' && <span className="text-amber-300"> · partial</span>}
              </button>
              </Hint>
            ))}
          </div>
          <p className="mt-2 hidden text-xs text-sky-inkDim sm:block">Keyboard: Space to play or pause, ← → to step.</p>
        </>
      )}
    </div>
  )
}
