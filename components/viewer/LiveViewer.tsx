'use client'

import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Copy, ExternalLink, Info, Loader2, RotateCcw, Search, X } from 'lucide-react'
import BlinkPlayer from '@/components/viewer/BlinkPlayer'
import { Term } from '@/components/Term'
import { BAND_TIPS } from '@/lib/glossary'
import { BAND_INFO } from '@/lib/target-stories'
import { formatDay } from '@/lib/long-baseline'
import type { LoadedPlayerFrame } from '@/lib/bundle-loader'
import {
  CUTOUT_CONCURRENCY, LIVE_PRESETS, attemptsToLog, describeFailure, emptyResultMessage, liveApiBase,
  liveCutout, liveSearch, runPool, sharedStretch, toRgba,
  type LiveBand, type LiveCollection, type LiveCutoutOk, type LiveExposure, type LiveSearchOk,
} from '@/lib/live-fetch'
import {
  GRID, GRID_CENTER, formatDec, formatRa, gridSky, groupVisits, parseDec, parseRa, prepareWcs,
  reprojectToGrid, subtractBackground, type LiveExposureGrid, type LiveVisit,
} from '@/lib/live-reproject'

/** Exposures to fetch per run: enough for a few per visit without overloading IRSA. */
const LIVE_MAX_EXPOSURES = 12
const BANDS: LiveBand[] = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6']

export interface LiveQuery {
  ra: number
  dec: number
  band: LiveBand
  collection: LiveCollection
}

/** Reads ?live=1&ra=…&dec=…&band=…&release=… ; null when the position is missing or invalid. */
export function liveQueryFromParams(sp: URLSearchParams): LiveQuery | null {
  const ra = parseRa(sp.get('ra') ?? '')
  const dec = parseDec(sp.get('dec') ?? '')
  if (typeof ra !== 'number' || typeof dec !== 'number') return null
  const b = sp.get('band')
  return {
    ra, dec,
    band: BANDS.includes(b as LiveBand) ? (b as LiveBand) : 'D2',
    collection: sp.get('release') === 'qr3' ? 'qr3' : 'dr1',
  }
}

function liveUrl(q: LiveQuery | null): string {
  if (!q) return '/viewer?live=1'
  const qs = new URLSearchParams({ live: '1', ra: q.ra.toFixed(6), dec: q.dec.toFixed(6), band: q.band })
  if (q.collection !== 'dr1') qs.set('release', q.collection)
  return `/viewer?${qs.toString()}`
}

type Phase = 'idle' | 'searching' | 'downloading' | 'aligning' | 'done' | 'error'

interface LiveResult {
  query: LiveQuery
  visits: LiveVisit[]
  frames: LoadedPlayerFrame[]
  /** Exposures IRSA has for this spot and band, before picking LIVE_MAX_EXPOSURES */
  available: number
  skipped: number
  seconds: number
}

function gridToPng(grid: (number | null)[], lo: number, hi: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = GRID
  canvas.height = GRID
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.putImageData(new ImageData(toRgba(grid, lo, hi) as Uint8ClampedArray<ArrayBuffer>, GRID, GRID), 0, 0)
  return canvas.toDataURL('image/png')
}

const input =
  'w-full min-h-11 rounded-lg border border-sky-border bg-sky-bg px-3 font-mono text-sm text-sky-ink placeholder:text-sky-inkDim/60 focus:border-sky-accent/60'

export default function LiveViewer({ picker, initialQuery }: { picker: React.ReactNode; initialQuery: LiveQuery | null }) {
  const router = useRouter()
  const formId = useId()
  const [raText, setRaText] = useState(() => (initialQuery ? formatRa(initialQuery.ra) : ''))
  const [decText, setDecText] = useState(() => (initialQuery ? formatDec(initialQuery.dec) : ''))
  const [band, setBand] = useState<LiveBand>(initialQuery?.band ?? 'D2')
  const [collection, setCollection] = useState<LiveCollection>(initialQuery?.collection ?? 'dr1')
  const [fieldError, setFieldError] = useState<{ ra?: string; dec?: string }>({})

  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [message, setMessage] = useState('')
  const [log, setLog] = useState<string[]>([])
  const [result, setResult] = useState<LiveResult | null>(null)
  const [runId, setRunId] = useState(0)
  const [copied, setCopied] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const startedAt = useRef(0)
  const [lastQuery, setLastQuery] = useState<LiveQuery | null>(initialQuery)

  const busy = phase === 'searching' || phase === 'downloading' || phase === 'aligning'

  const run = useCallback(async (q: LiveQuery) => {
    const addLog = (line: string) =>
      setLog(l => [...l, `+${((performance.now() - startedAt.current) / 1000).toFixed(1)} s  ${line}`])
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    // A newer run (or a cancel) supersedes this one: it must not touch the screen any more
    const stale = () => abortRef.current !== ac || ac.signal.aborted
    setLastQuery(q)
    startedAt.current = performance.now()
    router.replace(liveUrl(q), { scroll: false })
    setResult(null)
    setLog([])
    setMessage('')
    setProgress({ done: 0, total: 0 })
    setPhase('searching')
    const base = liveApiBase()
    try {
      // 1. Which SPHEREx exposures cover this spot?
      const search = await liveSearch(base, { ...q, max: LIVE_MAX_EXPOSURES }, ac.signal)
      if (stale()) return
      const sBody = search.body as LiveSearchOk | null
      if (sBody && 'attempts' in sBody) attemptsToLog('search', sBody.attempts).forEach(addLog)
      if (!sBody || sBody.ok !== true) {
        setMessage(describeFailure(search, 'search'))
        setPhase('error')
        return
      }
      const empty = emptyResultMessage(sBody)
      if (empty) {
        setMessage(`${empty} Try another band, or switch the data release under More options.`)
        setPhase('error')
        return
      }
      addLog(`search OK: ${sBody.bandRows} ${q.band} exposures, using ${sBody.exposures.length} spread over time`)

      // 2. Cut out the patch from each exposure, a few at a time (IRSA throttles bursts)
      setPhase('downloading')
      setProgress({ done: 0, total: sBody.exposures.length })
      const cutouts = await runPool(sBody.exposures, CUTOUT_CONCURRENCY, async (e: LiveExposure, i) => {
        const c = await liveCutout(base, q.ra, q.dec, e.accessUrl, ac.signal)
        if (stale()) return null
        const cBody = c.body as LiveCutoutOk | null
        if (cBody && 'attempts' in cBody) attemptsToLog(`image ${i + 1}`, cBody.attempts).forEach(addLog)
        setProgress(p => ({ ...p, done: p.done + 1 }))
        if (!cBody || cBody.ok !== true) {
          addLog(`image ${i + 1} skipped: ${describeFailure(c, 'cutout')}`)
          return null
        }
        return { exposure: e, cutout: cBody }
      }, ac.signal)
      if (stale()) return

      // 3. Turn every exposure north-up on the viewer grid, then stack by visit
      setPhase('aligning')
      const sky = gridSky(q.ra, q.dec)
      const grids: LiveExposureGrid[] = []
      let skipped = 0
      cutouts.forEach((r, i) => {
        if (!r) { skipped++; return }
        const wcs = prepareWcs(r.cutout.wcs)
        if (!wcs) { skipped++; addLog(`image ${i + 1} skipped: no usable sky orientation (WCS)`); return }
        const grid = reprojectToGrid(r.cutout.pixels, r.cutout.width, r.cutout.height, wcs, sky)
        const covered = grid.filter(v => v !== null).length / grid.length
        if (covered < 0.5) { skipped++; addLog(`image ${i + 1} skipped: covers only ${(covered * 100).toFixed(0)}% of the patch`); return }
        grids.push({ obsId: r.exposure.obsId, date: r.exposure.date, tMin: r.exposure.tMin, accessUrl: r.exposure.accessUrl, grid: subtractBackground(grid) })
      })
      if (grids.length === 0) {
        setMessage('None of the images could be used. The archive may be struggling: try again in a minute.')
        setPhase('error')
        return
      }
      const visits = groupVisits(grids)
      const stretch = sharedStretch(visits.map(v => v.grid)) ?? { lo: 0, hi: 1 }
      const target = { x: GRID_CENTER, y: GRID_CENTER, png_x: GRID_CENTER, png_y: GRID_CENTER }
      const frames: LoadedPlayerFrame[] = visits.map(v => ({
        visitId: v.id,
        visitType: v.exposures.length >= 2 ? 'full' : 'partial',
        dateStart: v.dateStart,
        dateEnd: v.dateEnd,
        band: q.band,
        imageUrl: gridToPng(v.grid, stretch.lo, stretch.hi),
        diffUrl: null,
        targetPng: target,
        nImages: v.exposures.length,
        nCoadded: v.exposures.length,
        bandsPresent: [q.band],
      }))
      addLog(`aligned ${grids.length} exposures into ${visits.length} visit${visits.length === 1 ? '' : 's'}`)
      const seconds = Math.round((performance.now() - startedAt.current) / 1000)
      setResult({ query: q, visits, frames, available: sBody.bandRows, skipped, seconds })
      setRunId(n => n + 1)
      setPhase('done')
    } catch (e) {
      // Cancelled by the visitor: back to the form. Superseded by a newer run: say nothing.
      if (e instanceof Error && e.name === 'AbortError') {
        if (abortRef.current === ac) {
          setPhase('idle')
          setMessage('')
        }
        return
      }
      if (stale()) return
      setMessage(e instanceof Error ? `Something went wrong: ${e.message}` : 'Something went wrong')
      setPhase('error')
    }
  }, [router])

  // A shared live link fetches straight away (deferred so state is not set inside the effect)
  useEffect(() => {
    let cancelled = false
    if (initialQuery) void Promise.resolve().then(() => { if (!cancelled) void run(initialQuery) })
    else router.replace(liveUrl(null), { scroll: false })
    return () => {
      cancelled = true
      abortRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = (ev?: React.FormEvent) => {
    ev?.preventDefault()
    const ra = parseRa(raText)
    const dec = parseDec(decText)
    const errs = { ra: typeof ra === 'string' ? ra : undefined, dec: typeof dec === 'string' ? dec : undefined }
    setFieldError(errs)
    if (typeof ra !== 'number' || typeof dec !== 'number') return
    void run({ ra, dec, band, collection })
  }

  const pickPreset = (p: (typeof LIVE_PRESETS)[number]) => {
    setRaText(formatRa(p.ra))
    setDecText(formatDec(p.dec))
    setBand(p.band)
    setFieldError({})
    void run({ ra: p.ra, dec: p.dec, band: p.band, collection })
  }

  const cancel = () => abortRef.current?.abort()

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  const q = result?.query ?? null
  const simbad = q
    ? `https://simbad.cds.unistra.fr/simbad/sim-coo?Coord=${encodeURIComponent(`${q.ra.toFixed(5)} ${q.dec >= 0 ? '+' : ''}${q.dec.toFixed(5)}`)}&Radius=2.5&Radius.unit=arcmin`
    : ''
  const step = phase === 'searching' ? 1 : phase === 'downloading' ? 2 : phase === 'aligning' ? 3 : 0

  return (
    <>
      <div className="min-w-0 space-y-5">
        {picker}

        {/* Position form */}
        <section aria-labelledby={`${formId}-h`} className="rounded-xl border border-sky-border bg-sky-surface p-5">
          <h2 id={`${formId}-h`} className="mb-1 text-lg font-bold">Look at any position in the sky</h2>
          <p className="mb-4 max-w-3xl text-sm text-sky-inkDim">
            Type a sky position and SkyBlink fetches the <Term k="spherex">SPHEREx</Term> images of that spot from NASA’s{' '}
            <Term k="irsa">archive</Term> as you wait. It usually takes about a minute. Most stars’ positions are listed on Wikipedia or in SIMBAD.
          </p>
          <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${formId}-ra`} className="mb-1 block text-sm font-semibold text-sky-ink">Right ascension (RA)</label>
              <input id={`${formId}-ra`} className={input} value={raText} onChange={e => setRaText(e.target.value)}
                placeholder="17h 57m 48s  or  269.45" autoComplete="off" spellCheck={false} inputMode="text"
                aria-invalid={!!fieldError.ra} aria-describedby={`${formId}-ra-hint`} />
              <p id={`${formId}-ra-hint`} className={`mt-1 text-xs ${fieldError.ra ? 'text-red-300' : 'text-sky-inkDim'}`}>
                {fieldError.ra ?? 'Hours, minutes, seconds, or decimal degrees'}
              </p>
            </div>
            <div>
              <label htmlFor={`${formId}-dec`} className="mb-1 block text-sm font-semibold text-sky-ink">Declination (Dec)</label>
              <input id={`${formId}-dec`} className={input} value={decText} onChange={e => setDecText(e.target.value)}
                placeholder="+04° 41′ 36″  or  4.69" autoComplete="off" spellCheck={false}
                aria-invalid={!!fieldError.dec} aria-describedby={`${formId}-dec-hint`} />
              <p id={`${formId}-dec-hint`} className={`mt-1 text-xs ${fieldError.dec ? 'text-red-300' : 'text-sky-inkDim'}`}>
                {fieldError.dec ?? 'Degrees, minutes, seconds, or decimal degrees'}
              </p>
            </div>
            <div>
              <label htmlFor={`${formId}-band`} className="mb-1 block text-sm font-semibold text-sky-ink">Infrared band</label>
              <select id={`${formId}-band`} className={input} value={band} onChange={e => setBand(e.target.value as LiveBand)}
                aria-describedby={`${formId}-band-hint`}>
                {BANDS.map(b => (
                  <option key={b} value={b}>{b} · {BAND_INFO[b].range} · {BAND_INFO[b].plain}</option>
                ))}
              </select>
              <p id={`${formId}-band-hint`} className="mt-1 text-xs text-sky-inkDim">{BAND_TIPS[band].def}</p>
            </div>
            <details className="text-sm text-sky-inkDim sm:self-start">
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-sky-accent">More options</summary>
              <label htmlFor={`${formId}-rel`} className="mb-1 mt-1 block font-semibold text-sky-ink">Data release</label>
              <select id={`${formId}-rel`} className={input} value={collection} onChange={e => setCollection(e.target.value as LiveCollection)}>
                <option value="dr1">DR1 (first full release)</option>
                <option value="qr3">QR3 (quick release, newer images)</option>
              </select>
            </details>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              {/* Separate keys: reusing one element lets a Cancel click turn into a submit as the type flips */}
              {busy ? (
                <button key="cancel" type="button" onClick={cancel}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sky-border px-5 font-semibold text-sky-ink hover:border-sky-accent/50">
                  <X className="h-4 w-4" aria-hidden="true" /> Cancel
                </button>
              ) : (
                <button key="submit" type="submit"
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-accent px-5 font-bold text-sky-bg hover:bg-sky-accent/90">
                  <Search className="h-4 w-4" aria-hidden="true" /> Fetch images
                </button>
              )}
              <span className="text-sm text-sky-inkDim">Or try a known one:</span>
              {LIVE_PRESETS.map(p => (
                <button key={p.id} type="button" disabled={busy} onClick={() => pickPreset(p)}
                  className="inline-flex min-h-11 sm:min-h-9 items-center rounded-full border border-sky-border px-3 text-sm text-sky-inkDim hover:border-sky-accent/40 hover:text-sky-ink disabled:opacity-50">
                  {p.id === 'wise-0855' ? 'WISE 0855' : p.name}
                </button>
              ))}
            </div>
          </form>
        </section>

        {/* Progress */}
        {busy && (
          <section aria-label="Fetching images" className="rounded-xl border border-sky-border bg-sky-surface p-5">
            <ol className="mb-4 grid gap-2 text-sm sm:grid-cols-3">
              {['Ask the archive', 'Download images', 'Line them up'].map((label, i) => (
                <li key={label} className={`flex items-center gap-2 ${step === i + 1 ? 'text-sky-ink font-semibold' : step > i + 1 ? 'text-sky-accent' : 'text-sky-inkDim'}`}>
                  {step > i + 1 ? <Check className="h-4 w-4" aria-hidden="true" />
                    : step === i + 1 ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    : <span className="inline-flex h-4 w-4 items-center justify-center text-xs" aria-hidden="true">{i + 1}</span>}
                  {label}
                </li>
              ))}
            </ol>
            <p className="text-sky-inkDim" role="status">
              {phase === 'searching' && 'Asking NASA’s archive which SPHEREx images cover this spot. This takes about 20 seconds, longer when the archive is busy.'}
              {phase === 'downloading' && `Downloading the patch from each image: ${progress.done} of ${progress.total}.`}
              {phase === 'aligning' && 'Turning every image north-up and stacking them by visit.'}
            </p>
            {phase === 'downloading' && progress.total > 0 && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sky-bg" aria-hidden="true">
                <div className="h-full bg-sky-accent transition-[width]" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
            )}
          </section>
        )}

        {phase === 'error' && (
          <section role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-5">
            <p className="mb-3 flex gap-2 text-amber-100">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
              <span>{message}</span>
            </p>
            {lastQuery && (
              <button type="button" onClick={() => run(lastQuery)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sky-border px-4 font-semibold text-sky-ink hover:border-sky-accent/50">
                <RotateCcw className="h-4 w-4" aria-hidden="true" /> Try again
              </button>
            )}
          </section>
        )}

        {/* Result */}
        {result && q && phase === 'done' && (
          <>
            <section aria-labelledby="live-h" className="rounded-xl border border-sky-border bg-sky-surface p-5">
              <p className="mb-1 text-sm text-sky-inkDim">
                <Term k="liveView">Live view</Term> · fetched just now in {result.seconds} s
              </p>
              <h1 id="live-h" className="mb-3 font-mono text-2xl font-bold tracking-tight sm:text-3xl">
                {formatRa(q.ra)} <span className="whitespace-nowrap">{formatDec(q.dec)}</span>
              </h1>
              <p className="max-w-3xl leading-relaxed text-sky-inkDim">
                Real SPHEREx images of this spot, turned <Term k="northUp">north up</Term> and averaged by <Term k="visit">visit</Term>.
                The crosshair marks the position you typed. Anything that moved between visits jumps when the images flip.
              </p>
              <p className="mt-3 flex max-w-3xl gap-2 leading-relaxed text-sky-ink">
                <Info className="mt-1 h-4 w-4 flex-shrink-0 text-sky-accent" aria-hidden="true" />
                <span>
                  Nothing here has been checked or labelled. Stars can also change brightness between visits because each{' '}
                  <Term k="exposure">exposure</Term> sees this spot in a slightly different infrared colour.{' '}
                  <a href={simbad} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sky-accent hover:underline">
                    See what is known here in SIMBAD <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span>
                  </a>
                </span>
              </p>
            </section>

            <section aria-label="Images" className="rounded-xl border border-sky-border bg-sky-surface p-4">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-sky-accent/30 bg-sky-accent/10 px-2.5 py-0.5 text-xs font-semibold text-sky-accent">Live</span>
                <span className="text-sm text-sky-inkDim">Band {q.band} · {result.frames.length} visit{result.frames.length === 1 ? '' : 's'}</span>
                <p className="ml-auto hidden text-sm text-sky-inkDim md:block">
                  <Term k="arcminute">5′</Term> of sky · <Term k="pixelScale">6.15″ per pixel</Term> · <Term k="northUp">north up</Term>
                </p>
              </div>
              {result.frames.length === 1 && (
                <p className="mb-3 text-sm text-amber-200">
                  Only one visit so far for this spot and band, so there is nothing to blink against yet. Try another band or the QR3 release.
                </p>
              )}
              <BlinkPlayer key={`live-${runId}`} frames={result.frames} showCrosshair label="The position you typed" />
            </section>
          </>
        )}

        {log.length > 0 && !busy && (
          <details className="rounded-xl border border-sky-border bg-sky-surface px-4 py-2 text-sm text-sky-inkDim">
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-sky-accent">What happened, step by step</summary>
            <pre className="mb-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed">{log.join('\n')}</pre>
          </details>
        )}
      </div>

      {/* Right column */}
      <aside className="space-y-4" aria-label="Details">
        {result && q && phase === 'done' ? (
          <section aria-labelledby="live-about-h" className="rounded-xl border border-sky-border bg-sky-surface p-4 text-sm">
            <h2 id="live-about-h" className="mb-3 font-semibold text-sky-ink">About these images</h2>
            <dl className="space-y-1.5">
              <div className="flex justify-between gap-3"><dt className="text-sky-inkDim"><Term k="ra">RA</Term></dt><dd className="font-mono text-sky-ink">{formatRa(q.ra)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-sky-inkDim"><Term k="dec">Dec</Term></dt><dd className="font-mono text-sky-ink">{formatDec(q.dec)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-sky-inkDim">In degrees</dt><dd className="font-mono text-sky-ink">{q.ra.toFixed(5)}, {q.dec.toFixed(5)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-sky-inkDim"><Term k="band">Band</Term></dt><dd className="text-sky-ink">{q.band} · {BAND_INFO[q.band].range}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-sky-inkDim"><Term k="dr1qr3">Data release</Term></dt><dd className="text-sky-ink">{q.collection.toUpperCase()}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-sky-inkDim">Images used</dt><dd className="text-sky-ink">{result.visits.reduce((n, v) => n + v.exposures.length, 0)} of {result.available}</dd></div>
            </dl>
            {result.skipped > 0 && (
              <p className="mt-2 text-xs text-sky-inkDim">{result.skipped} image{result.skipped === 1 ? '' : 's'} could not be used (see “What happened”).</p>
            )}

            <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-sky-inkDim">Visits</h3>
            <ul className="space-y-1.5">
              {result.visits.map(v => (
                <li key={v.id} className="flex justify-between gap-3">
                  <span className="text-sky-ink">{formatDay(v.dateStart)}{v.dateEnd !== v.dateStart ? ` to ${formatDay(v.dateEnd)}` : ''}</span>
                  <span className="text-sky-inkDim">{v.exposures.length} <Term k="exposure">{v.exposures.length === 1 ? 'exposure' : 'exposures'}</Term></span>
                </li>
              ))}
            </ul>
            <details className="mt-3">
              <summary className="inline-flex min-h-10 cursor-pointer items-center text-sky-accent">Original files</summary>
              <ul className="mt-1 space-y-1">
                {result.visits.flatMap(v => v.exposures).map(e => (
                  <li key={e.accessUrl}>
                    <a href={e.accessUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 font-mono text-xs text-sky-accent hover:underline">
                      {e.obsId ?? 'exposure'} · {e.date} <ExternalLink className="h-3 w-3" aria-hidden="true" /><span className="sr-only">(FITS file, opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </details>

            <button type="button" onClick={copyLink}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-sky-border text-sky-ink hover:border-sky-accent/50">
              {copied ? <Check className="h-4 w-4 text-sky-accent" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {copied ? 'Link copied' : 'Copy link to this view'}
            </button>
            <p className="sr-only" aria-live="polite">{copied ? 'Link copied to clipboard' : ''}</p>
          </section>
        ) : (
          <section className="rounded-xl border border-sky-border bg-sky-surface p-4 text-sm text-sky-inkDim">
            <h2 className="mb-2 font-semibold text-sky-ink">How live view works</h2>
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>SkyBlink asks NASA’s <Term k="irsa">IRSA</Term> archive which SPHEREx images cover your position.</li>
              <li>It downloads a 5′ patch from up to {LIVE_MAX_EXPOSURES} of them, spread over time.</li>
              <li>Each patch is turned north-up, then patches from the same <Term k="visit">visit</Term> are averaged.</li>
            </ol>
            <p className="mt-3">There is no object list for live positions yet: SkyBlink does not match live images against star catalogues.</p>
          </section>
        )}
      </aside>
    </>
  )
}
