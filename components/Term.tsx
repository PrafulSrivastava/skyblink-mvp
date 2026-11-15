'use client'

import React, { cloneElement, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { GLOSSARY, type GlossaryEntry, type GlossaryKey } from '@/lib/glossary'

/**
 * Hover, focus and tap explanations for technical terms.
 *
 * - <Term k="arcsecond">171″</Term>: inline text with a dotted underline. Hover or keyboard focus
 *   shows the explanation; a tap toggles it on touch screens.
 * - <Hint k="blink"><button>Blink</button></Hint>: explains a control without nesting a second
 *   focusable element inside it. Shows on mouse hover and keyboard focus.
 *
 * Tooltips meet WCAG 1.4.13: they can be dismissed with Escape, stay open while the pointer is over
 * them, and stay until the pointer or focus leaves. They are linked with aria-describedby.
 */

const OPEN_DELAY_MS = 250
const CLOSE_DELAY_MS = 150
const GAP = 8
const EDGE = 8

function entryFor(k: GlossaryKey | undefined, entry: GlossaryEntry | undefined): GlossaryEntry | null {
  return entry ?? (k ? GLOSSARY[k] : null)
}

/** Shared open/close timing, outside-tap closing and positioning. */
function useTooltip() {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }
  const show = useCallback((delay = 0) => {
    clear()
    if (delay) timer.current = setTimeout(() => setOpen(true), delay)
    else setOpen(true)
  }, [])
  const hide = useCallback((delay = 0) => {
    clear()
    if (delay) timer.current = setTimeout(() => setOpen(false), delay)
    else setOpen(false)
  }, [])

  useEffect(() => clear, [])

  // Place the tooltip above the anchor (below if there is no room), kept inside the window.
  const place = useCallback(() => {
    const a = anchorRef.current, t = tipRef.current
    if (!a || !t) return
    const r = a.getBoundingClientRect()
    const w = t.offsetWidth, h = t.offsetHeight
    const above = r.top - h - GAP >= EDGE
    const top = above ? r.top - h - GAP : r.bottom + GAP
    const left = Math.min(Math.max(EDGE, r.left + r.width / 2 - w / 2), window.innerWidth - w - EDGE)
    t.style.top = `${Math.round(top)}px`
    t.style.left = `${Math.round(left)}px`
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    place()
    const onMove = () => place()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!anchorRef.current?.contains(target)) setOpen(false)
    }
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open, place])

  return { open, setOpen, show, hide, anchorRef, tipRef }
}

function Bubble({ id, entry, open, tipRef }: { id: string; entry: GlossaryEntry; open: boolean; tipRef: React.RefObject<HTMLSpanElement | null> }) {
  return (
    <span
      ref={tipRef}
      id={id}
      role="tooltip"
      hidden={!open}
      className="term-tip"
    >
      <span className="term-tip-title">{entry.term}</span>
      <span className="term-tip-def">{entry.def}</span>
    </span>
  )
}

interface TermProps {
  /** Glossary key */
  k?: GlossaryKey
  /** Or a one-off entry */
  entry?: GlossaryEntry
  children: React.ReactNode
  className?: string
}

/** Inline term: dotted underline, explanation on hover, focus or tap. */
export function Term({ k, entry, children, className = '' }: TermProps) {
  const id = useId()
  const e = entryFor(k, entry)
  const { open, setOpen, show, hide, anchorRef, tipRef } = useTooltip()
  const lastPointer = useRef<string>('mouse')
  if (!e) return <>{children}</>

  return (
    <span
      ref={anchorRef}
      className="relative inline"
      onPointerEnter={ev => { if (ev.pointerType === 'mouse') show(OPEN_DELAY_MS) }}
      onPointerLeave={ev => { if (ev.pointerType === 'mouse') hide(CLOSE_DELAY_MS) }}
    >
      <button
        type="button"
        className={`term ${className}`}
        aria-describedby={id}
        aria-expanded={open}
        onPointerDown={ev => { lastPointer.current = ev.pointerType }}
        onFocus={() => show()}
        onBlur={() => hide()}
        onClick={ev => {
          ev.preventDefault(); ev.stopPropagation()
          // A mouse click keeps the hover tooltip open; a tap (or Enter) toggles it
          if (lastPointer.current === 'mouse' && ev.detail > 0) show()
          else setOpen(o => !o)
        }}
      >
        {children}
      </button>
      <Bubble id={id} entry={e} open={open} tipRef={tipRef} />
    </span>
  )
}

interface HintProps {
  k?: GlossaryKey
  entry?: GlossaryEntry
  children: React.ReactElement<{ 'aria-describedby'?: string }>
  /** Wrapper display; most controls sit in flex rows */
  className?: string
}

/** Explanation for a control (button, link, chip) on mouse hover and keyboard focus. */
export function Hint({ k, entry, children, className = 'inline-flex' }: HintProps) {
  const id = useId()
  const e = entryFor(k, entry)
  const { open, show, hide, anchorRef, tipRef } = useTooltip()
  if (!e || !isValidElement(children)) return children

  return (
    <span
      ref={anchorRef}
      className={`relative ${className}`}
      onPointerEnter={ev => { if (ev.pointerType === 'mouse') show(OPEN_DELAY_MS) }}
      onPointerLeave={ev => { if (ev.pointerType === 'mouse') hide(CLOSE_DELAY_MS) }}
      onFocusCapture={ev => { if ((ev.target as HTMLElement).matches?.(':focus-visible')) show() }}
      onBlurCapture={() => hide()}
    >
      {cloneElement(children, { 'aria-describedby': id })}
      <Bubble id={id} entry={e} open={open} tipRef={tipRef} />
    </span>
  )
}

/**
 * Renders a string with inline terms written as [[shown text|glossaryKey]].
 * Keeps copy in plain strings (lib/target-stories.ts) while still marking terms.
 */
export function RichText({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  const re = /\[\[([^|\]]+)\|([A-Za-z0-9]+)\]\]/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const key = m[2] as GlossaryKey
    parts.push(key in GLOSSARY ? <Term key={i++} k={key}>{m[1]}</Term> : m[1])
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

/** Strip [[text|key]] markup, for places that need plain text (aria-labels, titles). */
export function plainText(text: string): string {
  return text.replace(/\[\[([^|\]]+)\|[A-Za-z0-9]+\]\]/g, '$1')
}
