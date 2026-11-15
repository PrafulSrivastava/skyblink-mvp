'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Play } from 'lucide-react'
import SoloGame, { type Round, type SoloGameHandle } from './SoloGame'
import { loadBundleTarget, framesForBand, BUNDLE_TARGET_IDS } from '@/lib/bundle-loader'
import { TARGET_STORIES } from '@/lib/target-stories'

const REVEAL_URLS: Record<string, string> = {
  'barnards-star': 'https://en.wikipedia.org/wiki/Barnard%27s_Star',
  'eps-indi-b':    'https://en.wikipedia.org/wiki/Epsilon_Indi',
  'wise-0855':     'https://en.wikipedia.org/wiki/WISE_0855%E2%88%920714',
  'rw-aur':        'https://en.wikipedia.org/wiki/RW_Aurigae',
  'r-dra':         'https://en.wikipedia.org/wiki/R_Draconis',
}

const HOW = [
  { t: 'Watch the blink', d: 'Two real SPHEREx images of the same sky flip back and forth.' },
  { t: 'Spot what moved', d: 'One object shifts between them. Tap it, or use the arrow keys and Enter.' },
  { t: 'Score points', d: 'Closer and faster scores more, up to 1,000 a round.' },
]

export default function BattleClient() {
  const [rounds, setRounds] = useState<Round[]>([])
  const [loading, setLoading] = useState(true)
  const gameRef = useRef<SoloGameHandle>(null)

  useEffect(() => {
    async function buildRounds() {
      const loaded: Round[] = []
      for (const targetId of BUNDLE_TARGET_IDS) {
        try {
          const data = await loadBundleTarget(targetId)
          const frames = framesForBand(data, data.manifest.default_band)
          if (frames.length < 2) continue
          const f0 = frames[0]
          const f1 = frames[frames.length - 1]
          const story = TARGET_STORIES[targetId]
          loaded.push({
            id: `round-${targetId}`,
            type: 'fast-star',
            frames: [f0.imageUrl, f1.imageUrl],
            // Truth: motion-corrected target pixel in the later image (row 0 = north)
            truthPx: { x: f1.targetPng.png_x, y: f1.targetPng.png_y },
            revealName: story.name,
            revealUrl: REVEAL_URLS[targetId] ?? 'https://irsa.ipac.caltech.edu',
            imageWidth: 49,
            imageHeight: 49,
            dates: [f0.dateStart, f1.dateStart],
            hint: `${story.kind}. ${story.tag}.`,
          })
        } catch (e) {
          console.error(`Failed round for ${targetId}:`, e)
        }
      }
      setRounds(loaded)
      setLoading(false)
    }
    buildRounds()
  }, [])

  return (
    <>
      <section aria-labelledby="battle-h" className="relative overflow-hidden border-b border-sky-border">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true"
          style={{ background: 'radial-gradient(ellipse at 20% 30%, rgba(189,163,139,0.12) 0%, rgba(10,13,20,0) 60%)' }} />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 py-14 lg:grid-cols-2">
          <div>
            <p className="mb-5 inline-flex rounded-full border border-battle-accent/40 bg-battle-accent/10 px-3 py-1.5 text-sm text-battle-accent">
              Real SPHEREx DR1 and QR3 images
            </p>
            <h1 id="battle-h" className="mb-4 text-5xl font-black leading-tight tracking-tight sm:text-6xl">Blink Battle</h1>
            <p className="mb-8 max-w-lg text-lg text-sky-inkDim">
              Astronomers found moving stars by flipping between photographs. Try it yourself: spot what moved in real NASA infrared images.
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={loading || !rounds.length} onClick={() => gameRef.current?.start()}
                className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-battle-accent px-6 font-bold text-sky-bg transition-colors hover:bg-battle-accent/90 disabled:opacity-60">
                <Play className="h-4 w-4" aria-hidden="true" /> {loading ? 'Loading images…' : 'Play now'}
              </button>
              <Link href="/viewer" className="inline-flex min-h-12 items-center rounded-xl border border-sky-border px-6 font-semibold text-sky-ink transition-colors hover:border-battle-accent/60">
                Open the viewer
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-sky-border bg-sky-surface p-6">
            <h2 className="mb-4 font-bold">How to play</h2>
            <ol className="space-y-4">
              {HOW.map((s, i) => (
                <li key={s.t} className="flex gap-3">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-battle-accent/15 font-bold text-battle-accent">{i + 1}</span>
                  <div>
                    <h3 className="font-semibold">{s.t}</h3>
                    <p className="text-sky-inkDim">{s.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section id="game" aria-label="Game" className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
        <div className="rounded-2xl border border-sky-border bg-sky-surface p-4 sm:p-6">
          {loading ? (
            <p role="status" className="py-16 text-center text-sky-inkDim">Loading SPHEREx rounds…</p>
          ) : rounds.length > 0 ? (
            <SoloGame ref={gameRef} rounds={rounds} />
          ) : (
            <p role="alert" className="py-16 text-center text-sky-inkDim">Could not load the game images. Please try again later.</p>
          )}
        </div>
      </section>
    </>
  )
}
