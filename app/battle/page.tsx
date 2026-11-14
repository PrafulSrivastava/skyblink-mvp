'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Zap } from 'lucide-react'
import SoloGame from '@/components/battle/SoloGame'
import { loadBundleTarget, framesForBand, BUNDLE_TARGET_IDS, TARGET_DISPLAY } from '@/lib/bundle-loader'

const REVEAL_URLS: Record<string, string> = {
  'barnards-star': 'https://en.wikipedia.org/wiki/Barnard%27s_Star',
  'eps-indi-b':    'https://en.wikipedia.org/wiki/Epsilon_Indi',
  'wise-0855':     'https://en.wikipedia.org/wiki/WISE_0855%E2%88%920714',
  'rw-aur':        'https://en.wikipedia.org/wiki/RW_Aurigae',
  'r-dra':         'https://en.wikipedia.org/wiki/R_Draconis',
}

export default function BattlePage() {
  const [rounds, setRounds] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function buildRounds() {
      const loaded: any[] = []

      for (const targetId of BUNDLE_TARGET_IDS) {
        try {
          const data = await loadBundleTarget(targetId)
          const band = data.manifest.default_band
          const frames = framesForBand(data, band)

          // Need at least first and last (or any two) frames
          if (frames.length < 2) continue

          const f0 = frames[0]
          const f1 = frames[frames.length - 1]

          // Ground truth: target pixel in the LAST frame (PM-corrected)
          // png_x/png_y are 0-based image coordinates
          const truthPng = f1.targetPng

          loaded.push({
            id: `round-${targetId}`,
            type: 'fast-star',
            frames: [f0.imageUrl, f1.imageUrl],
            // truth uses PNG coords (row 0 = north edge, matches canvas display)
            truthPx: { x: truthPng.png_x, y: truthPng.png_y },
            revealName: TARGET_DISPLAY[targetId].label,
            revealUrl: REVEAL_URLS[targetId] ?? 'https://irsa.ipac.caltech.edu',
            imageWidth: 49,
            imageHeight: 49,
            dates: [f0.dateStart, f1.dateStart],
            hint: TARGET_DISPLAY[targetId].hint,
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
    <div className="min-h-screen font-epilogue" style={{ backgroundColor: '#2b2216', color: '#e4e2da' }}>
      {/* Nav */}
      <nav className="border-b px-6 py-3 flex items-center justify-between" style={{ borderColor: '#4a3c2c' }}>
        <Link href="/" className="flex items-center gap-2">
          <Zap className="w-5 h-5" style={{ color: '#bda38b' }} />
          <span className="font-black tracking-tight">Blink Battle</span>
        </Link>
        <Link href="/viewer" className="text-sm transition-colors" style={{ color: '#a89880' }}>
          SkyBlink Viewer →
        </Link>
      </nav>

      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 30% 50%, rgba(45,34,22,0.8) 0%, #2b2216 70%)' }}>
          {Array.from({ length: 100 }, (_, i) => (
            <div key={i} className="absolute rounded-full" style={{
              left: `${(i * 37 + 11) % 100}%`, top: `${(i * 61 + 7) % 100}%`,
              width: i % 7 === 0 ? 2 : 1, height: i % 7 === 0 ? 2 : 1,
              backgroundColor: `rgba(228,226,218,${0.2 + (i % 5) * 0.15})`,
            }} />
          ))}
        </div>

        <div className="relative px-6 py-16 max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs mb-6"
                style={{ backgroundColor: 'rgba(189,163,139,0.15)', border: '1px solid rgba(189,163,139,0.3)', color: '#bda38b' }}>
                Real SPHEREx DR1 + QR3 · 1,917 frames
              </div>
              <h1 className="text-5xl sm:text-6xl font-black mb-4 leading-tight">Blink Battle</h1>
              <p className="text-lg mb-8" style={{ color: '#a89880' }}>
                Spot what moved in real SPHEREx infrared images. Tap the moving star — score by accuracy and speed.
              </p>
              <div className="flex gap-4">
                <a href="#game" className="px-6 py-3 rounded-xl font-bold text-sm"
                  style={{ backgroundColor: '#bda38b', color: '#2b2216' }}
                  onClick={e => { e.preventDefault(); document.getElementById('game')?.scrollIntoView({ behavior: 'smooth' }) }}>
                  Play Solo
                </a>
                <Link href="/viewer" className="px-6 py-3 rounded-xl font-bold text-sm border"
                  style={{ borderColor: '#4a3c2c', color: '#a89880' }}>
                  Open Viewer
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border p-6 space-y-4" style={{ backgroundColor: '#382d1e', borderColor: '#4a3c2c' }}>
              <div className="font-bold mb-2">How to play</div>
              {[
                { n: '1', t: 'Watch the blink', d: 'Two real SPHEREx frames flash alternately.' },
                { n: '2', t: 'Spot the motion',  d: 'One star shifted. Tap it.' },
                { n: '3', t: 'Score points',     d: 'Accuracy × speed. Max 1000 per round.' },
              ].map(s => (
                <div key={s.n} className="flex gap-3">
                  <div className="text-lg font-black flex-shrink-0 w-5" style={{ color: '#bda38b' }}>{s.n}</div>
                  <div>
                    <div className="font-bold text-sm">{s.t}</div>
                    <div className="text-xs mt-0.5" style={{ color: '#a89880' }}>{s.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Game */}
      <div id="game" className="px-6 pb-16 max-w-6xl mx-auto">
        <div className="rounded-2xl border p-6" style={{ backgroundColor: '#382d1e', borderColor: '#4a3c2c' }}>
          {loading ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-4">🔭</div>
              <div className="font-mono text-sm" style={{ color: '#a89880' }}>Loading SPHEREx rounds…</div>
            </div>
          ) : rounds.length > 0 ? (
            <SoloGame rounds={rounds} />
          ) : (
            <div className="text-center py-16 font-mono text-sm" style={{ color: '#a89880' }}>Could not load rounds.</div>
          )}
        </div>
      </div>

      <footer className="border-t px-6 py-6" style={{ borderColor: '#4a3c2c' }}>
        <div className="max-w-6xl mx-auto text-xs" style={{ color: '#6b5940' }}>
          SPHEREx DR1 (doi:10.26131/IRSA678) + QR3 (doi:10.26131/IRSA662) · ESA/Gaia/DPAC · CatWISE2020 (doi:10.26131/IRSA551) · Apache-2.0
        </div>
      </footer>
    </div>
  )
}
