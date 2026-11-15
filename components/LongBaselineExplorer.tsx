'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, ArrowRight, Info } from 'lucide-react'
import LongBaselineBlink from './LongBaselineBlink'
import {
  LB_BANDS, formatDay, loadLbIndex, loadLbTarget, resolveLbBand,
  type LbBand, type LbIndex, type LbIndexTarget, type LbTarget,
} from '@/lib/long-baseline'
import { TARGET_STORIES } from '@/lib/target-stories'
import { isBundleTarget } from '@/lib/bundle-loader'
import { Hint, RichText, Term } from '@/components/Term'
import type { GlossaryKey } from '@/lib/glossary'

const chip = (on: boolean) =>
  `inline-flex min-h-11 sm:min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors ${
    on ? 'bg-sky-accent/15 border-sky-accent/50 text-sky-accent' : 'border-sky-border text-sky-inkDim hover:text-sky-ink hover:border-sky-accent/40'
  }`

const fmt = (v: number | null | undefined, n = 1) => (v == null ? 'n/a' : Number(v).toFixed(n))

export default function LongBaselineExplorer() {
  const router = useRouter()
  const params = useSearchParams()
  const [index, setIndex] = useState<LbIndex | null>(null)
  const [sel, setSel] = useState<{ meta: LbIndexTarget; data: LbTarget; band: LbBand } | null>(null)
  const [error, setError] = useState('')

  const pick = useCallback(async (id: string, band?: string | null) => {
    try {
      const { meta, data, index } = await loadLbTarget(id)
      const b = resolveLbBand(data, meta, band)
      setIndex(index)
      setSel({ meta, data, band: b })
      router.replace(`/long-baseline?target=${meta.id}&band=${b}`, { scroll: false })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the data')
    }
  }, [router])

  // Initial load from the URL; state is only set after the data arrives
  useEffect(() => {
    let live = true
    loadLbIndex().then(i => { if (live) setIndex(i) }).catch(() => {})
    void Promise.resolve().then(() => { if (live) return pick(params.get('target') ?? 'barnards-star', params.get('band')) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pair = sel ? sel.data.pairs[sel.band] : undefined
  const story = sel && isBundleTarget(sel.meta.id) ? TARGET_STORIES[sel.meta.id] : null
  const flags = sel ? sel.meta.labels.filter(l => l.bands.includes(sel.band)) : []
  const fitText = (f: { offset_from_pred_px: number | null } | null) =>
    f && f.offset_from_pred_px != null ? `${fmt(f.offset_from_pred_px, 2)} px` : 'core masked'

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10 sm:py-14">
      <div className="mb-8 max-w-3xl">
        <h1 className="mb-4 text-4xl font-black tracking-tight sm:text-5xl">16 years of motion in one blink</h1>
        <p className="text-lg text-sky-inkDim">
          A 2010 image from NASA’s <Term k="wise">WISE</Term> survey <Term k="blink">flips</Term> against a <Term k="spherex">SPHEREx</Term> image of the same sky from 2025–26.
          Over 16 years the fastest stars cross a big part of the frame, no measuring needed.
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300">{error}</p>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <div role="group" aria-label="Choose an object">
            <h2 className="mb-2 text-sm font-semibold text-sky-inkDim">Object</h2>
            <div className="flex flex-wrap gap-2">
              {(index?.targets ?? []).map(t => (
                <button key={t.id} type="button" className={chip(sel?.meta.id === t.id)} aria-pressed={sel?.meta.id === t.id}
                  onClick={() => pick(t.id, sel?.band)}>
                  {t.short}
                </button>
              ))}
            </div>
          </div>
          <div role="group" aria-label="Choose an infrared band">
            <h2 className="mb-2 text-sm font-semibold text-sky-inkDim"><Term k="infrared">Infrared</Term> <Term k="band">band</Term></h2>
            <div className="flex flex-wrap gap-2">
              {LB_BANDS.map(b => {
                const usable = !!sel?.data.pairs[b.id]?.usable
                return (
                  <Hint key={b.id} entry={{ term: `${b.label} · ${b.um}`, def: b.id === 'W1' ? 'WISE’s 3.4 µm filter, compared with SPHEREx light from 2.9 to 3.8 µm.' : 'WISE’s 4.6 µm filter, compared with SPHEREx light from 4.0 to 5.0 µm. Cold brown dwarfs show best here.' }}>
                  <button type="button" disabled={!usable} className={`${chip(sel?.band === b.id)} disabled:opacity-40`}
                    aria-pressed={sel?.band === b.id} onClick={() => {
                      if (!sel) return
                      setSel({ ...sel, band: b.id })
                      router.replace(`/long-baseline?target=${sel.meta.id}&band=${b.id}`, { scroll: false })
                    }}>
                    {b.label} <span className="text-xs opacity-80">{b.um}</span>
                  </button>
                  </Hint>
                )
              })}
            </div>
          </div>

          {sel && pair ? (
            <LongBaselineBlink key={`${sel.meta.id}-${sel.band}`} targetId={sel.meta.id} name={sel.data.name} data={sel.data} band={sel.band} />
          ) : (
            <div className="aspect-square w-full rounded-xl border border-sky-border shimmer" aria-label="Loading images" />
          )}

          {flags.length > 0 && (
            <ul className="space-y-2">
              {flags.map(f => (
                <li key={f.text} className={`flex gap-2 rounded-lg border px-3 py-2 text-sm ${
                  f.kind === 'warn' ? 'border-amber-400/30 bg-amber-400/5 text-amber-200' : 'border-sky-border bg-sky-surface text-sky-inkDim'
                }`}>
                  {f.kind === 'warn'
                    ? <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                    : <Info className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />}
                  <span><span className="sr-only">{f.kind === 'warn' ? 'Caution: ' : 'Note: '}</span>{f.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-6">
          {sel && story && (
            <section aria-labelledby="lb-about" className="rounded-xl border border-sky-border bg-sky-surface p-5">
              <h2 id="lb-about" className="text-2xl font-bold">{story.name}</h2>
              <p className="mb-3 text-sm text-sky-inkDim"><RichText text={story.kind} /></p>
              <p className="leading-relaxed text-sky-inkDim"><RichText text={story.story} /></p>
              <Link href={`/viewer?target=${sel.meta.id}`} className="mt-4 inline-flex min-h-11 items-center gap-1.5 font-semibold text-sky-accent hover:underline">
                Open the SPHEREx-only blink <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </section>
          )}

          {sel && pair && (
            <section aria-labelledby="lb-measure" className="rounded-xl border border-sky-border bg-sky-surface p-5">
              <h2 id="lb-measure" className="mb-4 text-lg font-bold">What the blink measures</h2>
              <dl className="divide-y divide-sky-border text-sm">
                {([
                  ['WISE image', 'wise', formatDay(sel.data.wise.date)],
                  ['SPHEREx image', 'spherex', `${formatDay(pair.spherex_date_start)} (visit ${pair.spherex_visit})`],
                  ['SPHEREx frames stacked', 'framesStacked', `${pair.spherex_n_frames}, at ${fmt(pair.spherex_wl_um[0], 2)}–${fmt(pair.spherex_wl_um[1], 2)} µm`],
                  ['Time between them', 'baseline', `${fmt(sel.data.motion.baseline_years, 1)} years`],
                  ['Proper motion', 'properMotion', `${fmt(sel.data.motion.pm_total_mas_yr, 0)} mas/yr`],
                  ['Expected shift', 'predictedShift', `${fmt(pair.shift_arcsec, 1)}″, about ${fmt(pair.shift_arcsec / 6.15, 1)} pixels`],
                  ['Fit vs prediction', 'fitOffset', `WISE ${fitText(pair.fit.wise)}, SPHEREx ${fitText(pair.fit.spherex)}`],
                ] as [string, GlossaryKey, string][]).map(([label, key, v]) => (
                  <div key={label} className="grid grid-cols-[minmax(0,10rem)_1fr] gap-3 py-2">
                    <dt className="text-sky-inkDim"><Term k={key}>{label}</Term></dt>
                    <dd className="font-mono text-sky-ink">{v}</dd>
                  </div>
                ))}
              </dl>
              {index && (
                <div className="mt-4 space-y-2 text-sm text-sky-inkDim">
                  <p>{index.band_note}</p>
                  <p>{index.normalisation}</p>
                </div>
              )}
            </section>
          )}

          <section aria-labelledby="lb-how" className="space-y-4 text-sky-inkDim">
            <h2 id="lb-how" className="text-lg font-bold text-sky-ink">How the two images line up</h2>
            <p>
              <strong className="text-sky-ink">Where the frames come from.</strong> The 2010 image is a cutout of the WISE All-Sky Atlas,
              dated by the WISE exposures that cover the star. The SPHEREx image stacks one visit’s frames whose wavelength at the star
              matches the WISE band.
            </p>
            <p>
              <strong className="text-sky-ink">One shared grid.</strong> Both are drawn on 49 × 49 pixels of <Term k="pixelScale">6.15″</Term>, centred halfway
              between the two positions so the star stays in view. WISE’s finer pixels are averaged into each cell.
            </p>
            <p>
              <strong className="text-sky-ink">The rings and the arrow.</strong> They come from <Term k="gaia">Gaia DR3</Term> or <Term k="catwise">CatWISE2020</Term> motion, not drawn by
              hand. A fit to the star lands within a pixel of them wherever its centre is not saturated.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
