import React, { Suspense } from 'react'
import type { Metadata } from 'next'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import LongBaselineExplorer from '@/components/LongBaselineExplorer'

export const metadata: Metadata = {
  title: '16 years of motion',
  description: "A 2010 NASA WISE image blinked against a 2025–26 SPHEREx image of the same sky. Barnard's Star crosses 171 arcseconds.",
}

export default function LongBaselinePage() {
  return (
    <div className="min-h-screen bg-sky-bg text-sky-ink font-manrope">
      <SiteHeader />
      <main id="main">
        <Suspense fallback={<div className="mx-auto max-w-7xl px-4 py-14 text-sky-inkDim">Loading…</div>}>
          <LongBaselineExplorer />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  )
}
