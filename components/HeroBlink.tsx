'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import LongBaselineBlink from './LongBaselineBlink'
import { loadLbTarget, type LbIndexTarget, type LbTarget } from '@/lib/long-baseline'

/** Landing-page demo: the real 16-year blink of Barnard's Star. */
export default function HeroBlink() {
  const [state, setState] = useState<{ meta: LbIndexTarget; data: LbTarget } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    loadLbTarget('barnards-star').then(r => setState(r)).catch(() => setFailed(true))
  }, [])

  return (
    <div className="rounded-2xl border border-sky-border bg-sky-surface p-4 sm:p-5 shadow-2xl">
      {state ? (
        <LongBaselineBlink targetId={state.meta.id} name={state.data.name} data={state.data} band={state.meta.default_band} compact />
      ) : (
        <div className="aspect-square w-full rounded-xl border border-sky-border shimmer" aria-hidden={!failed}>
          {failed && <p className="p-6 text-sm text-sky-inkDim">The demo images could not load. Open the viewer to explore the data.</p>}
        </div>
      )}
      <Link href="/long-baseline" className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-sky-accent hover:underline">
        Compare all five targets over 16 years
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  )
}
