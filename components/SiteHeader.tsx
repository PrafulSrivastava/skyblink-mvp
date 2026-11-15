'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, Zap } from 'lucide-react'

const LINKS = [
  { href: '/viewer', label: 'Viewer' },
  { href: '/long-baseline', label: '16 years of motion' },
  { href: '/battle', label: 'Blink Battle' },
  { href: '/#about', label: 'About the data' },
]

/** One header for every page: skip link, logo, nav, and a menu button on small screens. */
export default function SiteHeader() {
  const pathname = usePathname() ?? '/'
  const [open, setOpen] = useState(false)
  const [lastPath, setLastPath] = useState(pathname)

  // Close the mobile menu after navigating (including back/forward) or on Escape
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setOpen(false)
  }
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const isActive = (href: string) => !href.includes('#') && (pathname === href || pathname.startsWith(`${href}/`))

  return (
    <header className="border-b border-sky-border bg-sky-bg/95 backdrop-blur supports-[backdrop-filter]:bg-sky-bg/80 sticky top-0 z-40">
      <a href="#main" className="skip-link">Skip to content</a>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 py-3">
        <Link href="/" className="flex min-h-11 items-center gap-2 rounded-md font-bold tracking-tight text-sky-ink">
          <Zap className="h-5 w-5 text-sky-accent" aria-hidden="true" />
          SkyBlink
        </Link>

        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {LINKS.map(l => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={isActive(l.href) ? 'page' : undefined}
                  className={`inline-flex min-h-10 items-center rounded-md px-3 text-sm transition-colors ${
                    isActive(l.href) ? 'text-sky-ink bg-sky-surface' : 'text-sky-inkDim hover:text-sky-ink'
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden md:block">
          <Link href="/viewer" className="inline-flex min-h-10 items-center rounded-lg bg-sky-accent px-4 text-sm font-semibold text-sky-bg transition-colors hover:bg-sky-accent/90">
            Open the viewer
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-sky-border text-sky-ink md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen(o => !o)}
        >
          {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>

      {open && (
        <nav id="mobile-menu" aria-label="Main" className="border-t border-sky-border md:hidden">
          <ul className="mx-auto max-w-7xl px-4 py-2">
            {LINKS.map(l => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={isActive(l.href) ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                  className={`flex min-h-12 items-center rounded-md px-3 text-base ${
                    isActive(l.href) ? 'text-sky-ink bg-sky-surface' : 'text-sky-inkDim'
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  )
}
