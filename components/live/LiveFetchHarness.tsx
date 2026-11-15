'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Zap } from 'lucide-react'
import LiveBlink from '@/components/live/LiveBlink'
import {
  CUTOUT_CONCURRENCY,
  DEFAULT_MAX,
  LIVE_PRESETS,
  MAX_CAP,
  attemptsToLog,
  describeFailure,
  emptyResultMessage,
  liveApiBase,
  liveCutout,
  liveSearch,
  runPool,
  sharedStretch,
  validateCoords,
} from '@/lib/live-fetch'
import type {
  LiveBand,
  LiveCall,
  LiveCollection,
  LiveCutoutOk,
  LiveErrorBody,
  LiveExposure,
} from '@/lib/live-fetch'

type Level = 'info' | 'ok' | 'warn' | 'error'
interface LogLine {
  id: number
  t: number
  level: Level
  text: string
}

type RowStatus =
  | { state: 'pending' }
  | { state: 'ok'; pixels: (number | null)[]; width: number; height: number }
  | { state: 'failed'; short: string }
interface Row {
  key: string
  exp: LiveExposure
  status: RowStatus
}

const BANDS: LiveBand[] = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6']
const LEVEL_CLASS: Record<Level, string> = {
  info: 'text-sky-inkDim',
  ok: 'text-green-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`
const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError'

/** Short form of a failed call for the table. The full text goes to the log. */
function shortFailure(call: LiveCall<unknown>): string {
  if (call.networkError !== null) return 'no backend'
  const body = call.body as Partial<LiveErrorBody> | null
  const err = body && body.ok === false ? body.error : undefined
  if (!err) return call.httpStatus !== null ? `HTTP ${call.httpStatus}` : 'failed'
  switch (err.code) {
    case 'upstream_http':
      return `IRSA HTTP ${err.upstreamStatus ?? '?'}`
    case 'upstream_timeout':
      return 'IRSA timeout'
    case 'upstream_network':
      return 'IRSA unreachable'
    case 'bad_fits':
      return 'bad FITS'
    case 'bad_input':
      return 'rejected'
    default:
      return 'backend error'
  }
}

export default function LiveFetchHarness() {
  const [ra, setRa] = useState('')
  const [dec, setDec] = useState('')
  const [band, setBand] = useState<LiveBand>('D6')
  const [collection, setCollection] = useState<LiveCollection>('dr1')
  const [max, setMax] = useState(String(DEFAULT_MAX))
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<LogLine[]>([])
  const [rows, setRows] = useState<Row[]>([])

  const runRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const lineId = useRef(0)
  const base = liveApiBase()

  // Abandon any run on unmount so late results cannot touch state.
  useEffect(() => {
    return () => {
      // runRef is a run counter, not a DOM node, so reading it at cleanup time is intended.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      runRef.current++
      abortRef.current?.abort()
    }
  }, [])

  const frames = useMemo(
    () =>
      rows.map((r) => ({
        key: r.key,
        label: `${r.exp.date} · ${r.exp.obsId ?? 'unknown'}`,
        pixels: r.status.state === 'ok' ? r.status.pixels : null,
        width: r.status.state === 'ok' ? r.status.width : 49,
        height: r.status.state === 'ok' ? r.status.height : 49,
      })),
    [rows],
  )
  const stretch = useMemo(
    () => sharedStretch(frames.flatMap((f) => (f.pixels ? [f.pixels] : []))),
    [frames],
  )

  function pickPreset(p: (typeof LIVE_PRESETS)[number]) {
    setRa(String(p.ra))
    setDec(String(p.dec))
    setBand(p.band)
  }

  function cancel() {
    abortRef.current?.abort()
  }

  async function run() {
    const runId = ++runRef.current
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const { signal } = ctrl
    const t0 = performance.now()
    const stale = () => runId !== runRef.current
    const add = (level: Level, text: string) => {
      if (stale()) return
      const line = { id: lineId.current++, t: performance.now() - t0, level, text }
      setLog((l) => [...l, line])
    }

    setLog([])
    setRows([])
    setRunning(true)

    try {
      const coords = validateCoords(ra, dec)
      if (!coords.ok) {
        add('error', `Rejected input: ${coords.message}`)
        return
      }
      const maxN = Math.min(MAX_CAP, Math.max(1, Math.floor(Number(max)) || DEFAULT_MAX))
      if (String(maxN) !== max) setMax(String(maxN))

      add('info', `search started (IRSA SIA, ${collection}, ~20 s typical)`)
      const sc = await liveSearch(base, { ra: coords.ra, dec: coords.dec, collection, band, max: maxN }, signal)
      if (stale()) return
      const sb = sc.body
      if (!sb || sb.ok !== true || !Array.isArray(sb.exposures)) {
        const failAttempts = sb && sb.ok === false ? sb.attempts : undefined
        if (Array.isArray(failAttempts)) for (const l of attemptsToLog('search', failAttempts)) add('info', l)
        add('error', describeFailure(sc, 'search'))
        return
      }
      for (const l of attemptsToLog('search', sb.attempts ?? [])) add('info', l)
      add(
        'ok',
        `search OK: ${sb.totalRows} rows, ${sb.bandRows} in ${band}, showing ${sb.exposures.length}` +
          (sb.truncated ? ' (spread over time)' : ''),
      )
      const empty = emptyResultMessage(sb)
      if (empty !== null) {
        add('warn', empty)
        return
      }

      const exposures = sb.exposures
      const n = exposures.length
      setRows(
        exposures.map((exp, i) => ({
          key: `${exp.obsId ?? `row${i}`}-${exp.band}`,
          exp,
          status: { state: 'pending' },
        })),
      )

      let okCount = 0
      let failCount = 0
      await runPool(
        exposures,
        CUTOUT_CONCURRENCY,
        async (exp, i) => {
          const tag = `cutout ${i + 1}/${n} ${exp.obsId ?? 'unknown'}`
          const cc = await liveCutout(base, coords.ra, coords.dec, exp.accessUrl, signal)
          if (stale()) return
          const cb = cc.body
          const attempts = cb ? (cb as LiveCutoutOk | LiveErrorBody).attempts : undefined
          const retryLines = attempts && attempts.length > 1 ? attemptsToLog(tag, attempts) : []
          let status: RowStatus
          if (
            cb &&
            cb.ok === true &&
            Array.isArray(cb.pixels) &&
            cb.pixels.length === cb.width * cb.height &&
            cb.width > 0
          ) {
            okCount++
            status = { state: 'ok', pixels: cb.pixels, width: cb.width, height: cb.height }
            for (const l of retryLines) add('info', l)
            add('ok', `${tag}: OK in ${secs(cc.ms)}, ${cb.finite}/${cb.pixels.length} finite`)
          } else {
            failCount++
            const short = cb && cb.ok === true ? 'bad reply' : shortFailure(cc)
            status = { state: 'failed', short }
            for (const l of retryLines) add('info', l)
            add('error', `${tag}: ${cb && cb.ok === true ? 'backend returned an unusable cutout' : describeFailure(cc, 'cutout')}`)
          }
          setRows((rs) => rs.map((r, j) => (j === i ? { ...r, status } : r)))
        },
        signal,
      )
      if (stale()) return
      add('info', `done in ${secs(performance.now() - t0)}: ${okCount}/${n} cutouts OK, ${failCount} failed`)
    } catch (e) {
      if (isAbort(e)) {
        add('warn', 'cancelled')
        if (!stale()) {
          setRows((rs) =>
            rs.map((r) => (r.status.state === 'pending' ? { ...r, status: { state: 'failed', short: 'cancelled' } } : r)),
          )
        }
      } else {
        add('error', `Unexpected error: ${e instanceof Error ? e.message : String(e)}`)
      }
    } finally {
      if (!stale()) setRunning(false)
    }
  }

  const inputCls =
    'bg-sky-bg border border-sky-border rounded px-2 py-1.5 text-sm font-mono text-sky-ink focus:outline-none focus:border-sky-accent/60'
  const panel = 'bg-sky-surface border border-sky-border rounded-lg'

  return (
    <div className="min-h-screen bg-sky-bg text-sky-ink font-manrope">
      <nav className="border-b border-sky-border px-6 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-sm text-sky-inkDim hover:text-sky-ink transition-colors">
          <Zap className="w-4 h-4 text-sky-accent" />
          <span>← Home</span>
        </Link>
        <Link href="/viewer" className="text-sm text-sky-inkDim hover:text-sky-ink transition-colors">
          SkyBlink Viewer →
        </Link>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <header>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className="text-3xl font-black">Live fetch (experimental)</h1>
            <span className="px-2.5 py-1 rounded-full border border-yellow-500/40 bg-yellow-500/10 text-yellow-400 text-xs font-mono">
              Experimental test harness
            </span>
          </div>
          <p className="text-sky-inkDim text-sm">
            Fetches SPHEREx cutouts live from IRSA. Use it to see whether live fetch works, how long it takes and where
            it fails.
          </p>
          <p className="text-sky-inkDim text-xs font-mono mt-1">
            Backend: <span className="text-sky-ink">{base}</span>
          </p>
        </header>

        <section className={`${panel} p-4 space-y-4`}>
          <div className="flex flex-wrap gap-2">
            {LIVE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => pickPreset(p)}
                disabled={running}
                className="px-3 py-1 rounded-full border border-sky-border text-xs text-sky-inkDim hover:border-sky-accent/50 hover:text-sky-ink transition-colors disabled:opacity-40"
              >
                {p.name}
              </button>
            ))}
          </div>

          <form
            className="flex flex-wrap items-end gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!running) void run()
            }}
          >
            <label className="text-xs text-sky-inkDim space-y-1">
              <span className="block">RA (deg)</span>
              <input value={ra} onChange={(e) => setRa(e.target.value)} className={`${inputCls} w-36`} placeholder="133.7601588" inputMode="decimal" />
            </label>
            <label className="text-xs text-sky-inkDim space-y-1">
              <span className="block">Dec (deg)</span>
              <input value={dec} onChange={(e) => setDec(e.target.value)} className={`${inputCls} w-36`} placeholder="-7.2412971" inputMode="decimal" />
            </label>
            <label className="text-xs text-sky-inkDim space-y-1">
              <span className="block">Band</span>
              <select value={band} onChange={(e) => setBand(e.target.value as LiveBand)} className={inputCls}>
                {BANDS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-sky-inkDim space-y-1">
              <span className="block">Collection</span>
              <select value={collection} onChange={(e) => setCollection(e.target.value as LiveCollection)} className={inputCls}>
                <option value="dr1">DR1</option>
                <option value="qr3">QR3</option>
              </select>
            </label>
            <label className="text-xs text-sky-inkDim space-y-1">
              <span className="block">Max exposures (1–{MAX_CAP})</span>
              <input
                type="number"
                min={1}
                max={MAX_CAP}
                value={max}
                onChange={(e) => setMax(e.target.value)}
                className={`${inputCls} w-24`}
              />
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={running}
                className="px-4 py-2 rounded-lg bg-sky-accent text-sky-bg text-sm font-semibold hover:bg-sky-accent/90 transition-colors disabled:opacity-40"
              >
                Fetch
              </button>
              {running && (
                <button
                  type="button"
                  onClick={cancel}
                  className="px-4 py-2 rounded-lg border border-sky-border text-sm text-sky-ink hover:border-red-400/60 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>

        <section className={`${panel} p-4`}>
          <h2 className="text-sm font-bold mb-2">Log</h2>
          <div className="font-mono text-xs space-y-0.5 max-h-72 overflow-y-auto" aria-live="polite">
            {log.length === 0 ? (
              <div className="text-sky-inkDim">Nothing yet. Pick a preset and press Fetch.</div>
            ) : (
              log.map((l) => (
                <div key={l.id} className={`${LEVEL_CLASS[l.level]} whitespace-pre-wrap break-words`}>
                  {`+${(l.t / 1000).toFixed(1)}s  ${l.text}`}
                </div>
              ))
            )}
          </div>
        </section>

        {rows.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-start">
            <section className={`${panel} p-4 overflow-x-auto`}>
              <h2 className="text-sm font-bold mb-2">Exposures</h2>
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-left text-sky-inkDim">
                    <th className="pr-3 py-1 font-normal">#</th>
                    <th className="pr-3 py-1 font-normal">band</th>
                    <th className="pr-3 py-1 font-normal">collection</th>
                    <th className="pr-3 py-1 font-normal">obs_id</th>
                    <th className="pr-3 py-1 font-normal">date (UTC)</th>
                    <th className="py-1 font-normal">status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.key} className="border-t border-sky-border">
                      <td className="pr-3 py-1">{i + 1}</td>
                      <td className="pr-3 py-1">{r.exp.band}</td>
                      <td className="pr-3 py-1">{r.exp.collection.toUpperCase()}</td>
                      <td className="pr-3 py-1 break-all">{r.exp.obsId ?? '—'}</td>
                      <td className="pr-3 py-1">{r.exp.date}</td>
                      <td
                        className={`py-1 ${
                          r.status.state === 'ok'
                            ? 'text-green-400'
                            : r.status.state === 'failed'
                              ? 'text-red-400'
                              : 'text-sky-inkDim'
                        }`}
                      >
                        {r.status.state === 'pending' ? 'pending' : r.status.state === 'ok' ? 'OK' : r.status.short}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className={`${panel} p-4`}>
              <h2 className="text-sm font-bold mb-2">Blink</h2>
              <LiveBlink frames={frames} stretch={stretch} />
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
