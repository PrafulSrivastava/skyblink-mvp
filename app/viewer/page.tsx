'use client'

import React, { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import BlinkPlayer from '@/components/viewer/BlinkPlayer'
import DifferenceView from '@/components/viewer/DifferenceView'
import SpectrumPanel from '@/components/viewer/SpectrumPanel'
import MetadataPanel from '@/components/viewer/MetadataPanel'
import BandPicker from '@/components/viewer/BandPicker'
import {
  loadBundleTarget, isBundleTarget, framesForBand,
  BUNDLE_TARGET_IDS, TARGET_DISPLAY,
  type BundleTargetId, type LoadedBundleTarget, type LoadedPlayerFrame,
} from '@/lib/bundle-loader'
import { serializeState, deserializeState } from '@/lib/api'
import { Layers, ArrowLeftRight, Activity, Info, Zap, ExternalLink, Search, Loader2 } from 'lucide-react'
import Link from 'next/link'

function ViewerContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [loaded, setLoaded] = useState<LoadedBundleTarget | null>(null)
  const [band, setBand] = useState<string>('D3')
  const [displayFrames, setDisplayFrames] = useState<LoadedPlayerFrame[]>([])
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0)
  const [mode, setMode] = useState<'blink' | 'diff'>('blink')
  const [showSpectrum, setShowSpectrum] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // ── State shared with URL ────────────────────────────────────────────────────
  const urlState = deserializeState(searchParams.toString())

  const updateUrl = useCallback((targetId: string, b: string) => {
    const qs = serializeState({ targetId, band: b as any, ra: null, dec: null, fov: 10, mode: 'blink', frameIndex: 0, baselineOn: false, overlaysOn: false })
    router.replace(`/viewer?${qs}`, { scroll: false })
  }, [router])

  const loadTarget = useCallback(async (targetId: BundleTargetId) => {
    setLoading(true); setError('')
    try {
      const data = await loadBundleTarget(targetId)
      setLoaded(data)
      const b = data.target.default_band
      setBand(b)
      setDisplayFrames(framesForBand(data, b))
      setCurrentFrameIndex(0)
      updateUrl(targetId, b)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [updateUrl])

  const changeBand = useCallback((newBand: string) => {
    if (!loaded) return
    setBand(newBand)
    setDisplayFrames(framesForBand(loaded, newBand))
    setCurrentFrameIndex(0)
    updateUrl(loaded.id, newBand)
  }, [loaded, updateUrl])

  // Auto-load from URL on mount
  useEffect(() => {
    const tid = urlState.targetId
    if (tid && isBundleTarget(tid)) {
      loadTarget(tid)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Current frame for metadata panel
  const currentFrame = displayFrames[currentFrameIndex] ?? null

  // Diff pair
  const diffPair = loaded?.target.stretch[band]?.diff?.pair
  const frameA = diffPair ? (loaded ? framesForBand(loaded, band).find(f => f.visitId === diffPair[0]) ?? null : null) : null
  const frameB = diffPair ? (loaded ? framesForBand(loaded, band).find(f => f.visitId === diffPair[1]) ?? null : null) : null

  return (
    <div className="min-h-screen bg-sky-bg text-sky-ink font-manrope">
      {/* Nav */}
      <nav className="border-b border-sky-border px-6 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-sky-accent" />
          <span className="font-semibold tracking-tight">SkyBlink</span>
        </Link>
        <div className="flex gap-4 items-center text-sm">
          <Link href="/#how-it-works" className="text-sky-inkDim hover:text-sky-ink transition-colors">How it works</Link>
          <Link href="/battle" className="text-sky-inkDim hover:text-sky-ink transition-colors">Blink Battle</Link>
          <Link href="/#about" className="text-sky-inkDim hover:text-sky-ink transition-colors">About the data</Link>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        {/* Left */}
        <div className="space-y-5">
          {/* Target chips */}
          <div className="bg-sky-surface rounded-xl border border-sky-border p-4">
            <div className="text-sky-inkDim text-[10px] font-mono uppercase tracking-wider mb-3">
              5 precomputed SPHEREx targets
            </div>
            <div className="flex gap-2 flex-wrap">
              {BUNDLE_TARGET_IDS.map(tid => {
                const { label, hint } = TARGET_DISPLAY[tid]
                const active = loaded?.id === tid
                return (
                  <button key={tid} onClick={() => loadTarget(tid)} disabled={loading}
                    title={hint}
                    className={`px-3 py-1.5 rounded-full border text-xs transition-all disabled:opacity-50 ${
                      active
                        ? 'bg-sky-accent/15 border-sky-accent/50 text-sky-accent'
                        : 'border-sky-border text-sky-inkDim hover:border-sky-accent/40 hover:text-sky-ink'
                    }`}>
                    {loading && active ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}
                    {label}
                  </button>
                )
              })}
            </div>

            {/* Live search callout */}
            <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded border border-sky-border/50 bg-sky-bg/50">
              <Search className="w-3.5 h-3.5 text-sky-inkDim flex-shrink-0" />
              <span className="text-sky-inkDim text-xs">
                Live search for arbitrary coordinates — coming soon.
                Only the 5 precomputed targets are available in this release.
              </span>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Band picker */}
          {loaded && (
            <div className="bg-sky-surface rounded-xl border border-sky-border p-4">
              <BandPicker
                value={band}
                onChange={changeBand}
                availableBands={loaded.manifest.bands}
                defaultBand={loaded.manifest.default_band}
                saturated={loaded.target.id === 'barnards-star' || loaded.target.id === 'r-dra'}
              />
            </div>
          )}

          {/* Main viewer area */}
          {(loaded || loading) && (
            <div className="bg-sky-surface rounded-xl border border-sky-border p-4">
              {/* Mode toggle */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex rounded-lg border border-sky-border overflow-hidden">
                  {(['blink', 'diff'] as const).map(m => (
                    <button key={m} onClick={() => setMode(m)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${
                        m !== 'blink' ? 'border-l border-sky-border' : ''
                      } ${mode === m ? 'bg-sky-accent/20 text-sky-accent' : 'text-sky-inkDim hover:text-sky-ink'}`}>
                      {m === 'blink' ? <Layers className="w-3.5 h-3.5" /> : <ArrowLeftRight className="w-3.5 h-3.5" />}
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowSpectrum(s => !s)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                    showSpectrum ? 'bg-sky-accent/20 text-sky-accent border-sky-accent/40' : 'border-sky-border text-sky-inkDim hover:text-sky-accent hover:border-sky-accent/40'
                  }`}>
                  <Activity className="w-3.5 h-3.5" />
                  Spectrum
                </button>
                <div className="flex-1" />
                <div className="text-sky-inkDim text-xs hidden sm:block">49 × 49 px · 6.15″/px · north up</div>
              </div>

              {mode === 'blink' ? (
                <BlinkPlayer
                  frames={displayFrames}
                  isLoading={loading}
                  onFrameChange={setCurrentFrameIndex}
                  onPixelClick={() => setShowSpectrum(s => !s)}
                  showCrosshair
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Reference frame (visit A) */}
                  <div>
                    <div className="text-xs text-sky-inkDim mb-2 font-mono">
                      {frameA?.visitId ?? '—'} reference ({frameA?.dateStart})
                    </div>
                    {frameA ? (
                      <BlinkPlayer
                        frames={[frameA]}
                        isLoading={loading}
                        showCrosshair
                        fps={1}
                        displaySize={196}
                      />
                    ) : (
                      <div className="rounded border border-sky-border bg-sky-bg flex items-center justify-center text-sky-inkDim text-xs" style={{ height: 196 }}>
                        No frame A
                      </div>
                    )}
                  </div>
                  {/* Difference */}
                  <div>
                    <div className="text-xs text-sky-inkDim mb-2 font-mono">
                      Difference {frameB?.visitId ?? 'B'} − {frameA?.visitId ?? 'A'}
                    </div>
                    <DifferenceView
                      frameA={frameA}
                      frameB={frameB}
                      target={loaded?.target ?? null}
                      band={band}
                      isLoading={loading}
                      displaySize={196}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Spectrum panel */}
          {showSpectrum && loaded && (
            <SpectrumPanel
              spectrum={loaded.spectrum}
              targetId={loaded.id}
              isLoading={loading}
              onClose={() => setShowSpectrum(false)}
            />
          )}

          {/* Empty state */}
          {!loaded && !loading && (
            <div className="bg-sky-surface rounded-xl border border-sky-border p-8 text-center">
              <div className="text-5xl mb-4">🔭</div>
              <div className="text-sky-ink font-semibold mb-2">Watch the infrared sky move</div>
              <div className="text-sky-inkDim text-sm mb-4 max-w-sm mx-auto">
                Pick a target above. SkyBlink applies proper-motion correction and plays
                real SPHEREx frames as a blink.
              </div>
              <div className="flex gap-2 justify-center flex-wrap text-xs">
                <span className="px-2 py-1 rounded border border-sky-border text-sky-inkDim">Barnard's Star: 1.54 px dipole in D2</span>
                <span className="px-2 py-1 rounded border border-sky-border text-sky-inkDim">ε Indi B: 3.3 µm CH₄ dip</span>
                <span className="px-2 py-1 rounded border border-sky-border text-sky-inkDim">WISE 0855: 125.7″ coord stale</span>
              </div>
            </div>
          )}
        </div>

        {/* Right: metadata */}
        <div className="space-y-4">
          <MetadataPanel loaded={loaded} currentFrame={currentFrame} />

          {/* SPHEREx info card */}
          <div className="bg-sky-surface rounded-xl border border-sky-border p-4">
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-4 h-4 text-sky-accent" />
              <span className="text-xs font-semibold">SPHEREx</span>
            </div>
            <div className="text-sky-inkDim text-xs space-y-1">
              <div>102 infrared channels, 0.75–5 µm</div>
              <div>6 detectors (D1–D6), 6.15″/px</div>
              <div>PSF FWHM ~7.5″, launched Mar 2025</div>
              <div>Grid: 49 × 49 px per target (5′ FOV)</div>
            </div>
            <a href="https://spherex.caltech.edu" target="_blank" rel="noopener noreferrer"
              className="mt-3 flex items-center gap-1 text-xs text-sky-accent hover:underline">
              <ExternalLink className="w-3 h-3" />spherex.caltech.edu
            </a>
          </div>

          {/* WISE 0855 hero callout */}
          {loaded?.id === 'wise-0855' && (
            <div className="bg-sky-accent/5 border border-sky-accent/30 rounded-xl p-4">
              <div className="text-sky-accent text-xs font-semibold mb-1.5">📍 Stale coordinate — hero demonstration</div>
              <div className="text-sky-inkDim text-xs">
                The challenge brief gives <span className="font-mono text-sky-ink">08h55m10.831s −07°14′42.5″</span> for WISE 0855.
                That position is <strong className="text-sky-accent">125.7″ (20.4 px)</strong> from where the brown dwarf actually is in SPHEREx.
                SkyBlink corrects for 10.5 years of proper motion using CatWISE2020.
              </div>
            </div>
          )}

          {/* Barnard's Star motion fact */}
          {loaded?.id === 'barnards-star' && (
            <div className="bg-sky-surface rounded-xl border border-sky-border p-4">
              <div className="text-sky-inkDim text-[10px] font-mono uppercase tracking-wider mb-2">Motion measurement</div>
              <div className="text-sky-inkDim text-xs space-y-1">
                <div>Predicted: <span className="text-sky-ink font-mono">1.674 px</span> (v1→v5, 1 yr)</div>
                <div>Measured D2: <span className="text-sky-ink font-mono">1.54 px</span></div>
                <div>Ctrl-star: <span className="text-sky-ink font-mono">0.10 px</span></div>
                <div className="text-sky-inkDim">Wings-only Gaussian (core saturated)</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ViewerPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-sky-bg flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-sky-accent animate-spin" />
      </div>
    }>
      <ViewerContent />
    </Suspense>
  )
}
