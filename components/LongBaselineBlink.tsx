'use client'

import React, { useEffect, useState } from 'react'
import { Pause, Play, Route } from 'lucide-react'
import { formatDay, formatMonth, lbImageUrl, type LbBand, type LbTarget } from '@/lib/long-baseline'
import { useReducedMotion } from '@/lib/use-reduced-motion'

interface LongBaselineBlinkProps {
  targetId: string
  name: string
  data: LbTarget
  band: LbBand
  /** Smaller controls and no scale note, for the landing hero */
  compact?: boolean
  /** Start playing (ignored when the visitor prefers reduced motion) */
  autoplay?: boolean
}

const THEN = '#f5b97a' // 2010 marker: warm, dashed
const NOW = '#5ab9fc'  // SPHEREx marker: accent, solid
const BLINK_MS = 700

const chip = (on: boolean) =>
  `inline-flex items-center justify-center gap-1.5 min-h-11 sm:min-h-9 px-3 rounded-lg border text-sm transition-colors ${
    on
      ? 'bg-sky-accent/15 border-sky-accent/50 text-sky-accent'
      : 'border-sky-border text-sky-inkDim hover:text-sky-ink hover:border-sky-accent/40'
  }`

export default function LongBaselineBlink({ targetId, name, data, band, compact = false, autoplay = true }: LongBaselineBlinkProps) {
  const reduced = useReducedMotion()
  const [frame, setFrame] = useState<0 | 1>(0)
  // null = the visitor has not chosen yet: autoplay unless they asked the OS for reduced motion
  const [playChoice, setPlayChoice] = useState<boolean | null>(null)
  const playing = playChoice ?? (autoplay && !reduced)
  const setPlaying = (v: boolean | ((p: boolean) => boolean)) =>
    setPlayChoice(typeof v === 'function' ? v(playing) : v)
  const [showPath, setShowPath] = useState(true)

  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setFrame(f => (f === 0 ? 1 : 0)), BLINK_MS)
    return () => clearInterval(t)
  }, [playing])

  const pair = data.pairs[band]
  if (!pair) return null

  const wiseYear = data.wise.date.slice(0, 4)
  const nowYear = pair.spherex_date_start.slice(0, 4)
  const ax = pair.wise_px.png_x + 0.5, ay = pair.wise_px.png_y + 0.5
  const bx = pair.spherex_px.png_x + 0.5, by = pair.spherex_px.png_y + 0.5
  const len = Math.hypot(bx - ax, by - ay)
  const ux = len ? (bx - ax) / len : 0, uy = len ? (by - ay) / len : 0
  const shiftPx = pair.shift_arcsec / 6.15
  const moves = shiftPx >= 1

  const description = moves
    ? `${name}: a ${formatDay(data.wise.date)} WISE image and a ${formatMonth(pair.spherex_date_start)} SPHEREx image of the same patch of sky. Between them the star moved ${pair.shift_arcsec.toFixed(0)} arcseconds, about ${shiftPx.toFixed(0)} pixels.`
    : `${name}: a ${formatDay(data.wise.date)} WISE image and a ${formatMonth(pair.spherex_date_start)} SPHEREx image of the same patch of sky. This star barely moves (${pair.shift_arcsec.toFixed(1)} arcseconds in ${data.motion.baseline_years.toFixed(0)} years).`

  const show = (f: 0 | 1) => { setPlaying(false); setFrame(f) }

  return (
    <figure className="m-0">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-sky-border bg-sky-bg">
        <div role="img" aria-label={description} className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lbImageUrl(targetId, pair.paths.wise)} alt="" width={980} height={980}
            className="absolute inset-0 h-full w-full" style={{ imageRendering: 'pixelated', opacity: frame === 0 ? 1 : 0 }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lbImageUrl(targetId, pair.paths.spherex)} alt="" width={980} height={980}
            className="absolute inset-0 h-full w-full" style={{ imageRendering: 'pixelated', opacity: frame === 1 ? 1 : 0 }} />
          {showPath && (
            <svg viewBox="0 0 49 49" className="absolute inset-0 h-full w-full" aria-hidden="true">
              <defs>
                <marker id={`lb-arrow-${targetId}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                  <path d="M0 0L10 5L0 10z" fill="#e9edf3" />
                </marker>
              </defs>
              {len > 6 && (
                <line x1={ax + ux * 2.8} y1={ay + uy * 2.8} x2={bx - ux * 2.8} y2={by - uy * 2.8}
                  stroke="#e9edf3" strokeWidth={0.35} strokeLinecap="round" markerEnd={`url(#lb-arrow-${targetId})`} />
              )}
              <circle cx={ax} cy={ay} r={2.3} fill="none" stroke={THEN} strokeWidth={0.4} strokeDasharray="1 0.7" />
              <circle cx={bx} cy={by} r={2.3} fill="none" stroke={NOW} strokeWidth={0.4} />
            </svg>
          )}
        </div>

        {/* Epoch badge: what you are looking at right now */}
        <div className="absolute left-2 top-2 rounded-md bg-black/70 px-2.5 py-1 text-sm text-sky-ink">
          <span className="font-semibold" style={{ color: frame === 0 ? THEN : NOW }}>
            {frame === 0 ? wiseYear : nowYear}
          </span>{' '}
          <span className="text-sky-inkDim">{frame === 0 ? 'NASA WISE' : 'NASA SPHEREx'}</span>
        </div>
        {!compact && (
          <div className="absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-0.5 text-xs text-sky-inkDim">
            6.15″ per pixel · north up
          </div>
        )}
      </div>

      {/* Announce the frame only when the visitor is stepping, not on every autoplay tick */}
      <p className="sr-only" aria-live="polite">
        {playing ? '' : frame === 0 ? `Showing ${formatDay(data.wise.date)}, WISE` : `Showing ${formatMonth(pair.spherex_date_start)}, SPHEREx`}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Blink controls">
        <button type="button" className={chip(playing)} onClick={() => setPlaying(p => !p)} aria-pressed={playing}>
          {playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
          {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className={chip(!playing && frame === 0)} onClick={() => show(0)} aria-pressed={!playing && frame === 0}>
          <span className="inline-block h-2.5 w-2.5 rounded-full border border-dashed" style={{ borderColor: THEN }} aria-hidden="true" />
          {wiseYear}
        </button>
        <button type="button" className={chip(!playing && frame === 1)} onClick={() => show(1)} aria-pressed={!playing && frame === 1}>
          <span className="inline-block h-2.5 w-2.5 rounded-full border" style={{ borderColor: NOW }} aria-hidden="true" />
          {nowYear}
        </button>
        {!compact && (
          <button type="button" className={chip(showPath)} onClick={() => setShowPath(s => !s)} aria-pressed={showPath}>
            <Route className="h-4 w-4" aria-hidden="true" />
            Motion path
          </button>
        )}
      </div>

      <figcaption className="mt-3 text-sm text-sky-inkDim">
        {moves ? (
          <>
            <span className="text-sky-ink font-semibold">{name}</span> moved{' '}
            <span className="text-sky-ink">{pair.shift_arcsec.toFixed(0)}″</span> ({shiftPx.toFixed(0)} pixels) between{' '}
            {formatDay(data.wise.date)} and {formatMonth(pair.spherex_date_start)}.
            {' '}Dashed ring: its {wiseYear} position. Solid ring: its position now. Both are predicted from its catalogue motion, not drawn by hand.
          </>
        ) : (
          <>
            <span className="text-sky-ink font-semibold">{name}</span> barely moves: {pair.shift_arcsec.toFixed(1)}″ in{' '}
            {data.motion.baseline_years.toFixed(0)} years. Any change you see is brightness, not motion.
          </>
        )}
      </figcaption>
    </figure>
  )
}
