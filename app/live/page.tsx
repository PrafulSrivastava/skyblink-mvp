import React from 'react'
import type { Metadata } from 'next'
import LiveFetchHarness from '@/components/live/LiveFetchHarness'

export const metadata: Metadata = {
  title: 'Live fetch (experimental) — SkyBlink',
  robots: { index: false, follow: false },
}

export default function LivePage() {
  return <LiveFetchHarness />
}
