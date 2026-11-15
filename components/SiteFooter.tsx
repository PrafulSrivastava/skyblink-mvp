import React from 'react'
import Link from 'next/link'
import { Zap } from 'lucide-react'

const REPO_URL = 'https://github.com/PrafulSrivastava/skyblink-mvp'

/** Shared footer: links, data credits and licence. */
export default function SiteFooter() {
  return (
    <footer className="border-t border-sky-border px-4 sm:px-6 py-10">
      <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-semibold text-sky-ink">
            <Zap className="h-4 w-4 text-sky-accent" aria-hidden="true" />
            SkyBlink
            <span className="font-normal text-sky-inkDim text-sm">· NASA Space Apps 2026</span>
          </div>
          <p className="max-w-xl text-sm text-sky-inkDim">
            Images: SPHEREx DR1 (doi:10.26131/IRSA678) and QR3 (doi:10.26131/IRSA662), WISE All-Sky Atlas,
            via NASA/IPAC IRSA. Motion: ESA Gaia DR3 and CatWISE2020 (doi:10.26131/IRSA551). Code under Apache-2.0.
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
            <li><Link href="/viewer" className="inline-flex min-h-11 items-center px-2 text-sky-inkDim hover:text-sky-ink">Viewer</Link></li>
            <li><Link href="/long-baseline" className="inline-flex min-h-11 items-center px-2 text-sky-inkDim hover:text-sky-ink">16 years of motion</Link></li>
            <li><Link href="/battle" className="inline-flex min-h-11 items-center px-2 text-sky-inkDim hover:text-sky-ink">Blink Battle</Link></li>
            <li><Link href="/#about" className="inline-flex min-h-11 items-center px-2 text-sky-inkDim hover:text-sky-ink">Data credits</Link></li>
            <li><a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center px-2 text-sky-inkDim hover:text-sky-ink">Source on GitHub</a></li>
          </ul>
        </nav>
      </div>
    </footer>
  )
}
