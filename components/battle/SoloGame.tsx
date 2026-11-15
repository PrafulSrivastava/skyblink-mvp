'use client'

import React, { useState, useRef, useEffect, useCallback, useImperativeHandle } from 'react'
import { Target, Clock, Star, Award, ArrowRight, RotateCcw, ExternalLink, Trophy } from 'lucide-react'
import { formatMonth } from '@/lib/long-baseline'
import { RichText, Term } from '@/components/Term'

export interface Round {
  id: string
  type: 'asteroid' | 'fast-star'
  frames: string[]
  truthPx: { x: number; y: number }
  revealName: string
  revealUrl: string
  imageWidth: number
  imageHeight: number
  dates: string[]
  hint: string
}

interface Score {
  round: number
  tapPx: { x: number; y: number }
  truthPx: { x: number; y: number }
  distancePx: number
  timeSec: number
  points: number
}

// Scoring (unchanged): max 1000 pts/round. Distance in image pixels; time multiplier decays to a 0.3 floor.
function scoreRound(distPx: number, timeSec: number): number {
  const distScore = 1000 * Math.exp(-distPx / 25)
  const timeMult = Math.max(0.3, Math.exp(-(timeSec - 3) / 15))
  return Math.round(distScore * timeMult)
}

type GameState = 'intro' | 'playing' | 'reveal' | 'gameover'

export interface SoloGameHandle {
  /** Start a new game (used by the page's Play button) */
  start: () => void
}

interface SoloGameProps {
  rounds: Round[]
  ref?: React.Ref<SoloGameHandle>
}

const CANVAS = 392 // 49 × 8: sharp pixels, room for clear markers
const BLINK_MS = 500
const ACCENT = '#bda38b'
const TRUTH = '#5ab9fc'

function grade(pct: number) {
  if (pct >= 80) return 'Expert observer'
  if (pct >= 60) return 'Sharp-eyed'
  if (pct >= 40) return 'Getting there'
  return 'Keep practising'
}

export default function SoloGame({ rounds, ref }: SoloGameProps) {
  const [gameState, setGameState] = useState<GameState>('intro')
  const [currentRound, setCurrentRound] = useState(0)
  const [scores, setScores] = useState<Score[]>([])
  const [frameIdx, setFrameIdx] = useState(0)
  const [tapped, setTapped] = useState<{ x: number; y: number } | null>(null)
  const [cursor, setCursor] = useState({ x: 24, y: 24 })
  const [focused, setFocused] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [imagesReady, setImagesReady] = useState(0)

  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const blinkRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef(0)

  const round = rounds[currentRound]
  const totalScore = scores.reduce((s, r) => s + r.points, 0)
  const lastScore = scores[scores.length - 1]

  useEffect(() => {
    rounds.forEach(r => r.frames.forEach(src => {
      if (imgCacheRef.current.has(src)) return
      const img = new Image()
      img.onload = () => setImagesReady(n => n + 1)
      img.src = src
      imgCacheRef.current.set(src, img)
    }))
  }, [rounds])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !round) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const img = imgCacheRef.current.get(round.frames[frameIdx % round.frames.length])
    ctx.fillStyle = '#0a0d14'
    ctx.fillRect(0, 0, CANVAS, CANVAS)
    if (img?.complete && img.naturalWidth) {
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, 0, 0, CANVAS, CANVAS)
    }
    const s = CANVAS / round.imageWidth
    const ring = (x: number, y: number, color: string, r: number, dash?: number[]) => {
      ctx.strokeStyle = color
      ctx.lineWidth = 2.5
      ctx.setLineDash(dash ?? [])
      ctx.beginPath()
      ctx.arc((x + 0.5) * s, (y + 0.5) * s, r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
    // Keyboard reticle
    if (focused && !tapped && gameState === 'playing') {
      ring(cursor.x, cursor.y, '#e9edf3', 14, [5, 4])
    }
    if (tapped) ring(tapped.x, tapped.y, ACCENT, 14)
    if (gameState === 'reveal') {
      ring(round.truthPx.x, round.truthPx.y, TRUTH, 20)
      if (tapped) {
        ctx.strokeStyle = 'rgba(233,237,243,0.7)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo((tapped.x + 0.5) * s, (tapped.y + 0.5) * s)
        ctx.lineTo((round.truthPx.x + 0.5) * s, (round.truthPx.y + 0.5) * s)
        ctx.stroke()
      }
    }
  }, [round, frameIdx, tapped, gameState, cursor, focused])

  useEffect(() => { draw() }, [draw, imagesReady])

  const stopAll = useCallback(() => {
    if (blinkRef.current) clearInterval(blinkRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
  }, [])

  useEffect(() => stopAll, [stopAll])

  const startRound = useCallback(() => {
    setTapped(null)
    setFrameIdx(0)
    setCursor({ x: 24, y: 24 })
    // Bring the image fully into view before the clock starts
    rootRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    stopAll()
    blinkRef.current = setInterval(() => setFrameIdx(i => i + 1), BLINK_MS)
    setTimeout(() => {
      startTimeRef.current = Date.now()
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed((Date.now() - startTimeRef.current) / 1000), 100)
      canvasRef.current?.focus({ preventScroll: true })
    }, 450)
  }, [stopAll])

  const beginGame = useCallback(() => {
    setGameState('playing')
    setCurrentRound(0)
    setScores([])
    setTimeout(startRound, 50)
  }, [startRound])

  useImperativeHandle(ref, () => ({ start: beginGame }), [beginGame])

  const submit = (x: number, y: number) => {
    if (gameState !== 'playing' || tapped || !round || !startTimeRef.current) return
    const timeSec = (Date.now() - startTimeRef.current) / 1000
    stopAll()
    setTapped({ x, y })
    const dist = Math.hypot(x - round.truthPx.x, y - round.truthPx.y)
    setScores(s => [...s, { round: currentRound, tapPx: { x, y }, truthPx: round.truthPx, distancePx: dist, timeSec, points: scoreRound(dist, timeSec) }])
    setTimeout(() => setGameState('reveal'), 300)
  }

  const handleTap = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!round) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * round.imageWidth - 0.5
    const y = ((e.clientY - rect.top) / rect.height) * round.imageHeight - 0.5
    submit(x, y)
  }

  const handleKey = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (gameState !== 'playing' || tapped || !round) return
    setFocused(true) // show the keyboard ring only once the keyboard is in use
    const step = e.shiftKey ? 4 : 1
    const clamp = (v: number) => Math.max(0, Math.min(round.imageWidth - 1, v))
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (moves[e.key]) {
      e.preventDefault()
      setCursor(c => ({ x: clamp(c.x + moves[e.key][0]), y: clamp(c.y + moves[e.key][1]) }))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      submit(cursor.x, cursor.y)
    }
  }

  const nextRound = () => {
    if (currentRound + 1 >= rounds.length) { setGameState('gameover'); return }
    setCurrentRound(r => r + 1)
    setGameState('playing')
    setTimeout(startRound, 50)
  }

  const restartGame = () => {
    stopAll()
    setGameState('intro')
    setCurrentRound(0)
    setScores([])
  }

  if (gameState === 'intro') {
    return (
      <div ref={rootRef} className="mx-auto max-w-lg space-y-6 text-center">
        <div>
          <Target className="mx-auto mb-3 h-10 w-10 text-battle-accent" aria-hidden="true" />
          <h2 className="mb-2 text-2xl font-black text-sky-ink">Solo challenge</h2>
          <p className="text-sky-inkDim">
            {rounds.length} rounds. Two real <Term k="spherex">SPHEREx</Term> images <Term k="blink">flip back and forth</Term>: tap the object that moved.
            Closer and faster scores more.
          </p>
        </div>
        <ul className="grid grid-cols-3 gap-3">
          {[
            { icon: Star, label: `${rounds.length} rounds` },
            { icon: Clock, label: 'Faster scores more' },
            { icon: Award, label: `${(rounds.length * 1000).toLocaleString()} points max` },
          ].map(({ icon: Icon, label }) => (
            <li key={label} className="rounded-lg bg-sky-bg/60 p-3">
              <Icon className="mx-auto mb-1 h-5 w-5 text-battle-accent" aria-hidden="true" />
              <span className="text-sm text-sky-inkDim">{label}</span>
            </li>
          ))}
        </ul>
        <button type="button" onClick={beginGame}
          className="min-h-12 w-full rounded-xl bg-battle-accent text-lg font-bold text-sky-bg transition-colors hover:bg-battle-accent/90">
          Start game
        </button>
        <p className="text-sm text-sky-inkDim">Keyboard: arrow keys move the target ring (Shift for bigger steps), Enter to choose.</p>
      </div>
    )
  }

  if (gameState === 'gameover') {
    const pct = Math.round((totalScore / (rounds.length * 1000)) * 100)
    return (
      <div ref={rootRef} className="mx-auto max-w-lg space-y-6 text-center">
        <div>
          <Trophy className="mx-auto mb-3 h-10 w-10 text-battle-accent" aria-hidden="true" />
          <h2 className="text-2xl font-black text-sky-ink">{grade(pct)}</h2>
          <p className="mt-2 font-mono text-5xl font-black text-battle-accent">{totalScore.toLocaleString()}</p>
          <p className="mt-1 text-sky-inkDim">out of {(rounds.length * 1000).toLocaleString()} points</p>
        </div>
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Score for each round</caption>
          <thead className="text-sky-inkDim">
            <tr><th scope="col" className="py-1 font-medium">Round</th><th scope="col" className="font-medium">Object</th><th scope="col" className="font-medium">Off by</th><th scope="col" className="font-medium">Time</th><th scope="col" className="text-right font-medium">Points</th></tr>
          </thead>
          <tbody>
            {scores.map((s, i) => (
              <tr key={i} className="border-t border-sky-border">
                <td className="py-2 font-mono text-sky-inkDim">{i + 1}</td>
                <td className="text-sky-ink">{rounds[s.round]?.revealName}</td>
                <td className="text-sky-inkDim">{s.distancePx.toFixed(1)} px</td>
                <td className="text-sky-inkDim">{s.timeSec.toFixed(1)} s</td>
                <td className="text-right font-mono font-bold text-battle-accent">{s.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-3">
          <button type="button" onClick={beginGame}
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-sky-border text-sky-ink transition-colors hover:border-battle-accent/60">
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Play again
          </button>
          <a href="/viewer" className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-battle-accent font-semibold text-sky-bg transition-colors hover:bg-battle-accent/90">
            Explore in the viewer <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    )
  }

  const shownDate = round?.dates[frameIdx % (round?.dates.length || 1)]

  return (
    <div ref={rootRef} className="mx-auto max-w-lg space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-sky-inkDim">Round <span className="font-bold text-sky-ink">{currentRound + 1}</span> of {rounds.length}</span>
        <span className="flex items-center gap-1.5 font-mono text-lg font-bold text-battle-accent">
          <Award className="h-4 w-4" aria-hidden="true" /><span className="sr-only">Score </span>{totalScore}
        </span>
        <span className={`flex items-center gap-1.5 font-mono tabular-nums ${elapsed > 20 ? 'text-amber-300' : 'text-sky-inkDim'}`}>
          <Clock className="h-4 w-4" aria-hidden="true" /><span className="sr-only">Time </span>{elapsed.toFixed(1)} s
        </span>
      </div>

      <div className="relative overflow-hidden rounded-xl border-2 border-sky-border">
        <canvas
          ref={canvasRef}
          width={CANVAS}
          height={CANVAS}
          tabIndex={0}
          role="application"
          aria-label="Game image. Tap the object that moved, or use the arrow keys to move the ring and press Enter."
          className="block aspect-square w-full cursor-crosshair bg-sky-bg"
          style={{ imageRendering: 'pixelated' }}
          onClick={handleTap}
          onKeyDown={handleKey}
          onBlur={() => setFocused(false)}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between bg-black/70 px-3 py-1.5 text-sm">
          <span className="text-sky-ink">{shownDate ? formatMonth(shownDate) : ''}</span>
          <span className="font-mono text-sky-inkDim">image {(frameIdx % (round?.frames.length || 1)) + 1} of {round?.frames.length}</span>
        </div>
        {gameState === 'reveal' && lastScore && (
          <div className="pointer-events-none absolute right-3 top-3 rounded-lg bg-black/75 px-3 py-2 text-right">
            <div className="font-mono text-3xl font-black text-battle-accent">+{lastScore.points}</div>
            <div className="text-sm text-sky-inkDim">{lastScore.distancePx.toFixed(1)} px · {lastScore.timeSec.toFixed(1)} s</div>
          </div>
        )}
      </div>

      {gameState === 'playing' && !tapped && (
        <p className="text-center text-sm text-sky-inkDim">Tap the object that moved between the two images.</p>
      )}

      <div aria-live="polite">
        {gameState === 'reveal' && round && lastScore && (
          <div className="rounded-xl border border-sky-border bg-sky-surface p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-sky-ink">{round.revealName}</h3>
                <p className="text-sm text-sky-inkDim"><RichText text={round.hint} /></p>
                <p className="mt-1 text-sm text-sky-inkDim">
                  {lastScore.distancePx < 10 ? 'Spot on.' : lastScore.distancePx < 25 ? 'Close.' : 'Missed.'}{' '}
                  The blue ring shows where it was.
                </p>
              </div>
              <div className="text-right font-mono text-xl font-bold text-battle-accent">+{lastScore.points}</div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <a href={round.revealUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 text-sm text-battle-accent hover:underline">
                <ExternalLink className="h-4 w-4" aria-hidden="true" /> More about {round.revealName}<span className="sr-only"> (opens in a new tab)</span>
              </a>
              <button type="button" onClick={nextRound} autoFocus
                className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-battle-accent px-4 font-semibold text-sky-bg transition-colors hover:bg-battle-accent/90">
                {currentRound + 1 < rounds.length ? 'Next round' : 'See results'}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
