import React from 'react'
import type { Metadata } from 'next'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import BattleClient from '@/components/battle/BattleClient'

export const metadata: Metadata = {
  title: 'Blink Battle',
  description: 'A quick game: spot the star that moved in real NASA SPHEREx infrared images.',
}

export default function BattlePage() {
  return (
    <div className="min-h-screen bg-sky-bg text-sky-ink font-manrope">
      <SiteHeader />
      <main id="main">
        <BattleClient />
      </main>
      <SiteFooter />
    </div>
  )
}
