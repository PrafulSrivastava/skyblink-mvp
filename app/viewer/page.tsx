'use client'

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Layers, ArrowLeftRight, Activity, History, Loader2, MapPin, Info } from 'lucide-react'
import SiteHeader from '@/components/SiteHeader'
import BlinkPlayer from '@/components/viewer/BlinkPlayer'
import DifferenceView from '@/components/viewer/DifferenceView'
import SpectrumPanel from '@/components/viewer/SpectrumPanel'
import MetadataPanel from '@/components/viewer/MetadataPanel'
import BandPicker from '@/components/viewer/BandPicker'
import ObjectsPanel from '@/components/viewer/ObjectsPanel'
import ObjectsLegend from '@/components/viewer/ObjectsLegend'
import {
  loadBundleTarget, isBundleTarget, framesForBand,
  BUNDLE_TARGET_IDS,
  type BundleTargetId, type LoadedBundleTarget, type LoadedPlayerFrame,
} from '@/lib/bundle-loader'
import { visibleObjects, type MarkerMode } from '@/lib/object-overlay'
import { TARGET_STORIES } from '@/lib/target-stories'

const DEFAULT_TARGET: BundleTargetId = 'barnards-star'
type Mode = 'blink' | 'diff'

const GLOSSARY: [string, string][] = [
  ['Blink', 'Flipping between images of the same sky taken at different times. Anything that moved or changed brightness jumps.'],
  ['Band (D1–D6)', 'SPHEREx has six detectors, each covering a range of infrared wavelengths. D1 is closest to visible light, D6 the longest and best for cold objects.'],
  ['Visit', 'SPHEREx passes over each spot about every six months. The images from one pass are stacked into one picture. A partial visit has fewer images.'],
  ['Arcsecond (″)', 'A tiny angle: 1/3600 of a degree. The full Moon is about 1,800″ across. One pixel here is 6.15″.'],
  ['Proper motion (mas/yr)', 'How fast a star crawls across the sky, in thousandths of an arcsecond per year. Only nearby stars move enough to see.'],
  ['S/N', 'Signal-to-noise: how clearly an object stands out from the background. Above about 5 counts as a detection.'],
  ['Saturated', 'Too bright for the detector. The centre of the star is masked because its pixel values are not reliable.'],
  ['Spectrum', 'How bright an object is at each wavelength. Dips reveal molecules such as water or methane in its atmosphere.'],
]

function ViewerContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [loaded, setLoaded] = useState<LoadedBundleTarget | null>(null)
  const [band, setBand] = useState<string>('D2')
  const [displayFrames, setDisplayFrames] = useState<LoadedPlayerFrame[]>([])
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0)
  // View state starts from the URL so a shared link opens exactly the same view
  const [mode, setMode] = useState<Mode>(() => (searchParams.get('mode') === 'diff' ? 'diff' : 'blink'))
  const [showSpectrum, setShowSpectrum] = useState(() => searchParams.get('spectrum') === '1')
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null)
  const [markerMode, setMarkerMode] = useState<MarkerMode>(() => {
    const mk = searchParams.get('markers')
    return mk === 'off' || mk === 'all' ? mk : 'highlights'
  })
  const [loading, setLoading] = useState(true) // the first object loads on mount
  const [error, setError] = useState('')

  const applyLoaded = useCallback((data: LoadedBundleTarget, preferredBand?: string | null) => {
    setLoaded(data)
    const b = preferredBand && data.manifest.bands.includes(preferredBand) ? preferredBand : data.target.default_band
    setBand(b)
    setDisplayFrames(framesForBand(data, b))
    setCurrentFrameIndex(0)
  }, [])

  const showError = (e: unknown) =>
    setError(e instanceof Error ? `Could not load this object: ${e.message}` : 'Could not load this object')

  const loadTarget = useCallback((targetId: BundleTargetId) => {
    setLoading(true); setError('')
    setSelectedObjectId(null)
    loadBundleTarget(targetId)
      .then(data => applyLoaded(data))
      .catch(showError)
      .finally(() => setLoading(false))
  }, [applyLoaded])

  const changeBand = useCallback((newBand: string) => {
    if (!loaded) return
    setBand(newBand)
    setDisplayFrames(framesForBand(loaded, newBand))
    setCurrentFrameIndex(0)
  }, [loaded])

  // Load the object from the URL, or a default one instead of an empty page
  useEffect(() => {
    const tid = searchParams.get('target')
    let live = true
    loadBundleTarget(tid && isBundleTarget(tid) ? tid : DEFAULT_TARGET)
      .then(data => { if (live) applyLoaded(data, searchParams.get('band')) })
      .catch(e => { if (live) showError(e) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the URL in step with what is on screen, so "Copy link" shares exactly this view
  useEffect(() => {
    if (!loaded) return
    const qs = new URLSearchParams({ target: loaded.id, band, mode })
    if (showSpectrum) qs.set('spectrum', '1')
    if (markerMode !== 'highlights') qs.set('markers', markerMode)
    router.replace(`/viewer?${qs.toString()}`, { scroll: false })
  }, [loaded, band, mode, showSpectrum, markerMode, router])

  const currentFrame = displayFrames[currentFrameIndex] ?? null
  const story = loaded ? TARGET_STORIES[loaded.id] : null

  const markerObjects = useMemo(
    () => visibleObjects(loaded?.objects?.objects ?? [], markerMode, selectedObjectId),
    [loaded, markerMode, selectedObjectId],
  )

  // Diff pair
  const diffPair = loaded?.target.stretch[band]?.diff?.pair
  const bandFrames = loaded ? framesForBand(loaded, band) : []
  const frameA = diffPair ? bandFrames.find(f => f.visitId === diffPair[0]) ?? null : null
  const frameB = diffPair ? bandFrames.find(f => f.visitId === diffPair[1]) ?? null : null

  const modeBtn = (on: boolean) =>
    `inline-flex min-h-11 sm:min-h-9 items-center gap-1.5 px-3 text-sm transition-colors ${
      on ? 'bg-sky-accent/20 text-sky-accent' : 'text-sky-inkDim hover:text-sky-ink'
    }`

  return (
    <main id="main" className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* Left */}
      <div className="min-w-0 space-y-5">
        {/* Object picker */}
        <div className="rounded-xl border border-sky-border bg-sky-surface p-4">
          <p id="pick-h" className="mb-3 text-sm font-semibold text-sky-ink">Choose an object</p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="pick-h">
            {BUNDLE_TARGET_IDS.map(tid => {
              const active = loaded?.id === tid
              const s = TARGET_STORIES[tid]
              return (
                <button key={tid} type="button" onClick={() => loadTarget(tid)} disabled={loading}
                  aria-pressed={active}
                  className={`inline-flex min-h-11 sm:min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors disabled:opacity-60 ${
                    active
                      ? 'border-sky-accent/50 bg-sky-accent/15 text-sky-accent'
                      : 'border-sky-border text-sky-ink hover:border-sky-accent/40'
                  }`}>
                  {loading && active ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  {s.name}
                </button>
              )
            })}
          </div>
          <p className="mt-3 text-sm text-sky-inkDim">
            Five objects are ready to explore. Searching any position in the sky is planned for a later release.
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200">{error}</p>
        )}

        {/* What am I looking at? */}
        {story && loaded && (
          <section aria-labelledby="target-h" className="rounded-xl border border-sky-border bg-sky-surface p-5">
            <p className="mb-1 text-sm text-sky-inkDim">{story.kind}</p>
            <h1 id="target-h" className="mb-3 text-3xl font-black tracking-tight">{story.name}</h1>
            <p className="max-w-3xl leading-relaxed text-sky-inkDim">{story.story}</p>
            <p className="mt-3 flex max-w-3xl gap-2 leading-relaxed text-sky-ink">
              <Info className="mt-1 h-4 w-4 flex-shrink-0 text-sky-accent" aria-hidden="true" />
              <span>{story.tip}</span>
            </p>
            <details className="mt-3 text-sm text-sky-inkDim">
              <summary className="inline-flex min-h-10 cursor-pointer items-center text-sky-accent">The numbers</summary>
              <p className="mt-1 max-w-3xl">{story.tech}</p>
            </details>
          </section>
        )}

        {/* Main viewer area */}
        {(loaded || loading) && (
          <section aria-label="Images" className="rounded-xl border border-sky-border bg-sky-surface p-4">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div className="flex overflow-hidden rounded-lg border border-sky-border" role="group" aria-label="View">
                <button type="button" onClick={() => setMode('blink')} aria-pressed={mode === 'blink'} className={modeBtn(mode === 'blink')}>
                  <Layers className="h-4 w-4" aria-hidden="true" /> Blink
                </button>
                <button type="button" onClick={() => setMode('diff')} aria-pressed={mode === 'diff'} className={`${modeBtn(mode === 'diff')} border-l border-sky-border`}>
                  <ArrowLeftRight className="h-4 w-4" aria-hidden="true" /> Diff
                </button>
              </div>
              <button type="button" onClick={() => setShowSpectrum(s => !s)} aria-pressed={showSpectrum}
                className={`inline-flex min-h-11 sm:min-h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors ${
                  showSpectrum ? 'border-sky-accent/40 bg-sky-accent/20 text-sky-accent' : 'border-sky-border text-sky-inkDim hover:border-sky-accent/40 hover:text-sky-ink'
                }`}>
                <Activity className="h-4 w-4" aria-hidden="true" /> Spectrum
              </button>
              {loaded && (
                <Link href={`/long-baseline?target=${loaded.id}`}
                  className="inline-flex min-h-11 sm:min-h-9 items-center gap-1.5 rounded-lg border border-sky-border px-3 text-sm text-sky-inkDim transition-colors hover:border-sky-accent/40 hover:text-sky-ink">
                  <History className="h-4 w-4" aria-hidden="true" /> 16 years
                </Link>
              )}
              <p className="ml-auto hidden text-sm text-sky-inkDim md:block">5′ of sky · 6.15″ per pixel · north up</p>
            </div>

            {mode === 'blink' ? (
              <>
                <BlinkPlayer
                  key={`${loaded?.id ?? 'none'}-${band}`}
                  frames={displayFrames}
                  isLoading={loading}
                  onFrameChange={setCurrentFrameIndex}
                  objects={markerObjects}
                  selectedObjectId={selectedObjectId}
                  onPixelClick={c => setSelectedObjectId(c.objectId)}
                  label={story?.name}
                  showCrosshair
                />
                {loaded?.objects && <ObjectsLegend />}
              </>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-sky-ink">Earlier image</h3>
                  {frameA ? (
                    <BlinkPlayer frames={[frameA]} isLoading={loading} showCrosshair still displaySize={294} label={story?.name} />
                  ) : (
                    <div className="flex aspect-square items-center justify-center rounded-lg border border-sky-border bg-sky-bg text-sm text-sky-inkDim">
                      No earlier image in this band
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-sky-ink">What changed</h3>
                  <DifferenceView
                    frameA={frameA}
                    frameB={frameB}
                    target={loaded?.target ?? null}
                    band={band}
                    isLoading={loading}
                    displaySize={294}
                  />
                </div>
              </div>
            )}
          </section>
        )}

        {/* Band picker */}
        {loaded && (
          <div className="rounded-xl border border-sky-border bg-sky-surface p-4">
            <BandPicker
              value={band}
              onChange={changeBand}
              availableBands={loaded.manifest.bands}
              defaultBand={loaded.manifest.default_band}
              saturated={loaded.target.id === 'barnards-star' || loaded.target.id === 'r-dra'}
            />
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
      </div>

      {/* Right: objects, position, glossary */}
      <aside className="space-y-4" aria-label="Details">
        {mode === 'blink' && loaded && (
          <ObjectsPanel
            file={loaded.objects}
            selectedObjectId={selectedObjectId}
            onSelect={setSelectedObjectId}
            markerMode={markerMode}
            onMarkerModeChange={setMarkerMode}
          />
        )}

        {loaded?.id === 'wise-0855' && (
          <section aria-labelledby="stale-h" className="rounded-xl border border-sky-accent/30 bg-sky-accent/5 p-4 text-sm">
            <h2 id="stale-h" className="mb-1.5 flex items-center gap-1.5 font-semibold text-sky-accent">
              <MapPin className="h-4 w-4" aria-hidden="true" /> The published position is wrong
            </h2>
            <p className="text-sky-inkDim">
              The challenge brief gives <span className="font-mono text-sky-ink">08h55m10.831s −07°14′42.5″</span> for WISE 0855.
              That spot is <strong className="text-sky-ink">125.7″ (20 pixels)</strong> from where it really is in the SPHEREx images.
              SkyBlink corrects for 10.5 years of motion using CatWISE2020.
            </p>
          </section>
        )}

        <MetadataPanel loaded={loaded} currentFrame={currentFrame} />

        <section aria-labelledby="glossary-h" className="rounded-xl border border-sky-border bg-sky-surface p-4 text-sm">
          <h2 id="glossary-h" className="mb-2 text-base font-semibold text-sky-ink">What the terms mean</h2>
          <ul className="space-y-1">
            {GLOSSARY.map(([term, def]) => (
              <li key={term}>
                <details className="rounded-md">
                  <summary className="flex min-h-10 cursor-pointer items-center font-medium text-sky-ink">{term}</summary>
                  <p className="pb-2 text-sky-inkDim">{def}</p>
                </details>
              </li>
            ))}
          </ul>
          <a href="https://spherex.caltech.edu" target="_blank" rel="noopener noreferrer"
            className="mt-2 inline-flex min-h-10 items-center text-sky-accent hover:underline">
            About the SPHEREx mission<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </section>
      </aside>
    </main>
  )
}

export default function ViewerPage() {
  return (
    <div className="min-h-screen bg-sky-bg text-sky-ink font-manrope">
      <SiteHeader />
      <Suspense fallback={
        <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Loading viewer">
          <Loader2 className="h-6 w-6 animate-spin text-sky-accent" aria-hidden="true" />
        </div>
      }>
        <ViewerContent />
      </Suspense>
    </div>
  )
}
