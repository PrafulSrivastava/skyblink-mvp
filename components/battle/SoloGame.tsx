'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Target, Clock, Star, Award, ArrowRight, RotateCcw, ExternalLink } from 'lucide-react'

interface Round {
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

// Scoring: max 1000 pts/round
// Distance: 1000 * exp(-dist/20)
// Time: multiplier 1.0 at <5s, decays to 0.3 at 30s
function scoreRound(distPx: number, timeSec: number): number {
  const distScore = 1000 * Math.exp(-distPx / 25)
  const timeMult = Math.max(0.3, Math.exp(-(timeSec - 3) / 15))
  return Math.round(distScore * timeMult)
}

// Game state
type GameState = 'intro' | 'playing' | 'reveal' | 'gameover'

interface SoloGameProps {
  rounds: Round[]
}

export default function SoloGame({ rounds }: SoloGameProps) {
  const [gameState, setGameState] = useState<GameState>('intro')
  const [currentRound, setCurrentRound] = useState(0)
  const [scores, setScores] = useState<Score[]>([])
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0)
  const [tapped, setTapped] = useState<{ x: number; y: number } | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [startTime, setStartTime] = useState(0)
  const [blinking, setBlinking] = useState(true)
  
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const blinkIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const round = rounds[currentRound]
  const totalScore = scores.reduce((s, r) => s + r.points, 0)

  const preloadImages = useCallback((r: Round) => {
    r.frames.forEach(src => {
      if (!imgCacheRef.current.has(src)) {
        const img = new Image()
        img.src = src
        imgCacheRef.current.set(src, img)
      }
    })
  }, [])

  useEffect(() => {
    if (round) preloadImages(round)
  }, [round, preloadImages])

  const drawFrame = useCallback((idx: number) => {
    const canvas = canvasRef.current
    if (!canvas || !round) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const src = round.frames[idx % round.frames.length]
    const img = imgCacheRef.current.get(src)
    if (!img?.complete) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.imageSmoothingEnabled = false   // pixelated upscale for 49px images
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    // Date label
    ctx.fillStyle = 'rgba(0,0,0,0.65)'
    ctx.fillRect(0, canvas.height - 20, canvas.width, 20)
    ctx.fillStyle = '#e4e2da'
    ctx.font = '10px JetBrains Mono, monospace'
    ctx.textAlign = 'left'
    ctx.fillText(round.dates[idx % round.dates.length] || '', 6, canvas.height - 6)
    ctx.textAlign = 'right'
    ctx.fillText(`${idx % round.frames.length + 1}/${round.frames.length}`, canvas.width - 6, canvas.height - 6)

    // Show tap
    if (tapped) {
      const scale = canvas.width / round.imageWidth
      const tx = tapped.x * scale
      const ty = tapped.y * scale
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(tx, ty, 8, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(tx - 12, ty)
      ctx.lineTo(tx + 12, ty)
      ctx.moveTo(tx, ty - 12)
      ctx.lineTo(tx, ty + 12)
      ctx.stroke()
    }
  }, [round, tapped])

  useEffect(() => {
    drawFrame(currentFrameIdx)
  }, [drawFrame, currentFrameIdx, tapped])

  const startBlink = useCallback(() => {
    if (blinkIntervalRef.current) clearInterval(blinkIntervalRef.current)
    blinkIntervalRef.current = setInterval(() => {
      setCurrentFrameIdx(i => i + 1)
    }, 500)
  }, [])

  const stopBlink = useCallback(() => {
    if (blinkIntervalRef.current) clearInterval(blinkIntervalRef.current)
  }, [])

  const startTimer = useCallback(() => {
    const t = Date.now()
    setStartTime(t)
    setElapsed(0)
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    timerIntervalRef.current = setInterval(() => {
      setElapsed((Date.now() - t) / 1000)
    }, 100)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
  }, [])

  const startRound = useCallback(() => {
    setTapped(null)
    setCurrentFrameIdx(0)
    setBlinking(true)
    startBlink()
    startTimer()
  }, [startBlink, startTimer])

  const beginGame = () => {
    setGameState('playing')
    setCurrentRound(0)
    setScores([])
    setTimeout(startRound, 100)
  }

  const restartGame = () => {
    setGameState('intro')
    setCurrentRound(0)
    setScores([])
    stopBlink()
    stopTimer()
  }

  useEffect(() => {
    return () => {
      stopBlink()
      stopTimer()
    }
  }, [stopBlink, stopTimer])

  const handleTap = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (gameState !== 'playing' || tapped) return
    
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const scale = round.imageWidth / canvas.width
    const x = (e.clientX - rect.left) * (canvas.width / rect.width) * scale
    const y = (e.clientY - rect.top) * (canvas.height / rect.height) * scale
    
    const timeSec = (Date.now() - startTime) / 1000
    stopTimer()
    stopBlink()
    
    setTapped({ x, y })
    
    const dist = Math.sqrt((x - round.truthPx.x) ** 2 + (y - round.truthPx.y) ** 2)
    const pts = scoreRound(dist, timeSec)
    
    setScores(s => [...s, {
      round: currentRound,
      tapPx: { x, y },
      truthPx: round.truthPx,
      distancePx: dist,
      timeSec,
      points: pts,
    }])
    
    setTimeout(() => setGameState('reveal'), 400)
  }

  const nextRound = () => {
    if (currentRound + 1 >= rounds.length) {
      setGameState('gameover')
      return
    }
    setCurrentRound(r => r + 1)
    setGameState('playing')
    setTimeout(startRound, 100)
  }

  // Show reveal overlay
  const lastScore = scores[scores.length - 1]

  if (gameState === 'intro') {
    return (
      <div className="bg-battle-surface rounded-2xl border border-battle-border p-8 max-w-lg mx-auto text-center space-y-6">
        <div>
          <div className="text-5xl mb-3">🎯</div>
          <h2 className="text-2xl font-epilogue font-black text-battle-ink mb-2">
            Solo Challenge
          </h2>
          <p className="text-battle-inkDim text-sm">
            {rounds.length} rounds — spot the moving star in real SPHEREx data.
            Tap where you see motion. Score by accuracy × speed.
          </p>
        </div>
        
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Star, label: `${rounds.length} rounds` },
            { icon: Clock, label: '30s each' },
            { icon: Award, label: `${rounds.length * 1000} pts max` },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="bg-battle-bg/50 rounded-lg p-3">
              <Icon className="w-5 h-5 text-battle-accent mx-auto mb-1" />
              <div className="text-battle-inkDim text-xs">{label}</div>
            </div>
          ))}
        </div>
        
        <button
          onClick={beginGame}
          className="w-full py-3 rounded-xl bg-battle-accent text-battle-bg font-epilogue font-bold text-lg hover:bg-battle-accent/90 transition-colors"
        >
          Start Game
        </button>
      </div>
    )
  }

  if (gameState === 'gameover') {
    const pct = Math.round(totalScore / (rounds.length * 1000) * 100)
    const grade = pct >= 80 ? '🌟 Expert' : pct >= 60 ? '🔭 Observer' : pct >= 40 ? '👀 Beginner' : '📚 Keep practicing'
    
    return (
      <div className="bg-battle-surface rounded-2xl border border-battle-border p-8 max-w-lg mx-auto text-center space-y-6">
        <div>
          <div className="text-5xl mb-3">{pct >= 60 ? '🏆' : '🎉'}</div>
          <h2 className="text-2xl font-epilogue font-black text-battle-ink">{grade}</h2>
          <div className="text-5xl font-mono font-black text-battle-accent mt-2">
            {totalScore.toLocaleString()}
          </div>
          <div className="text-battle-inkDim text-sm mt-1">
            out of {(rounds.length * 1000).toLocaleString()} points
          </div>
        </div>
        
        {/* Per-round breakdown */}
        <div className="space-y-2 text-left">
          {scores.map((s, i) => (
            <div key={i} className="flex items-center justify-between text-sm bg-battle-bg/50 rounded-lg px-3 py-2">
              <span className="text-battle-inkDim font-mono">R{i+1}</span>
              <span className="text-battle-inkDim">{s.distancePx.toFixed(0)} px off</span>
              <span className="text-battle-inkDim">{s.timeSec.toFixed(1)}s</span>
              <span className="font-mono font-bold text-battle-accent">{s.points}</span>
            </div>
          ))}
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={restartGame}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-battle-border text-battle-inkDim hover:text-battle-ink transition-colors text-sm"
          >
            <RotateCcw className="w-4 h-4" />
            Play again
          </button>
          <a
            href="/viewer?target=barnards-star"
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-battle-accent/20 text-battle-accent border border-battle-accent/30 hover:bg-battle-accent/30 transition-colors text-sm"
          >
            Open SkyBlink
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-battle-inkDim text-sm font-mono">
          Round <span className="text-battle-ink font-bold">{currentRound + 1}</span> / {rounds.length}
        </div>
        <div className="flex items-center gap-2 text-battle-accent font-mono text-lg font-bold">
          <Award className="w-4 h-4" />
          {totalScore}
        </div>
        <div className={`flex items-center gap-1.5 font-mono text-sm tabular-nums ${elapsed > 20 ? 'text-red-400' : 'text-battle-inkDim'}`}>
          <Clock className="w-4 h-4" />
          {elapsed.toFixed(1)}s
        </div>
      </div>

      {/* Canvas */}
      <div className="relative rounded-xl overflow-hidden border-2 border-battle-border">
        <canvas
          ref={canvasRef}
          width={round?.imageWidth || 256}
          height={round?.imageHeight || 256}
          className="w-full cursor-crosshair block"
          style={{ imageRendering: 'pixelated', aspectRatio: '1', background: '#2b2216' }}
          onClick={handleTap}
        />
        
        {/* Type badge */}
        <div className="absolute top-2 left-2">
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-black/60 text-battle-accent border border-battle-accent/30">
            {round?.type === 'fast-star' ? '⭐ fast-star' : '☄ asteroid'}
          </span>
        </div>
        
        {gameState === 'reveal' && lastScore && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl font-mono font-black text-battle-accent mb-1">
                +{lastScore.points}
              </div>
              <div className="text-battle-inkDim text-sm">
                {lastScore.distancePx.toFixed(0)} px · {lastScore.timeSec.toFixed(1)}s
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Instructions / hint */}
      {gameState === 'playing' && !tapped && (
        <div className="text-battle-inkDim text-xs text-center font-mono">
          Tap the object that moved between frames.
          {round?.hint && <span className="ml-1 text-battle-accent/70">{round.hint}</span>}
        </div>
      )}

      {/* Reveal panel */}
      {gameState === 'reveal' && round && (
        <div className="bg-battle-surface rounded-xl border border-battle-border p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-battle-ink font-semibold">{round.revealName}</div>
              <div className="text-battle-inkDim text-xs mt-0.5">
                {round.type === 'fast-star' ? 'High proper-motion star' : 'Solar system asteroid'}
              </div>
            </div>
            {lastScore && (
              <div className="text-right">
                <div className="text-battle-accent font-mono font-bold text-xl">+{lastScore.points}</div>
                <div className="text-battle-inkDim text-xs">
                  {lastScore.distancePx < 10 ? 'Perfect!' : lastScore.distancePx < 25 ? 'Close!' : 'Miss'}
                </div>
              </div>
            )}
          </div>
          
          <div className="flex gap-3">
            <a
              href={round.revealUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-battle-accent hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              More info
            </a>
            <button
              onClick={nextRound}
              className="ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-battle-accent text-battle-bg font-semibold text-sm hover:bg-battle-accent/90 transition-colors"
            >
              {currentRound + 1 < rounds.length ? 'Next round' : 'See results'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
