'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { SkyObjectsFile, SkyObject } from '@/lib/sky-objects'
import { MARKER_STYLE, isHighlight, type MarkerMode } from '@/lib/object-overlay'
import { sortObjects, formatPm, type ObjectSortKey, type SortDir } from '@/lib/object-list'
import ObjectDetails from './ObjectDetails'
import MarkerSwatch from './MarkerSwatch'

interface ObjectsPanelProps {
  file: SkyObjectsFile | null
  selectedObjectId: string | null
  onSelect: (id: string | null) => void
  markerMode: MarkerMode
  onMarkerModeChange: (m: MarkerMode) => void
}

const SORT_BUTTONS: { key: ObjectSortKey; label: string }[] = [
  { key: 'snr', label: 'Brightness' },
  { key: 'kind', label: 'Category' },
  { key: 'name', label: 'Name' },
  { key: 'pm', label: 'Motion' },
]

const MARKER_MODES: { id: MarkerMode; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'highlights', label: 'Highlights' },
  { id: 'all', label: 'All' },
]

const NO_OBJECTS: readonly SkyObject[] = []

export default function ObjectsPanel({ file, selectedObjectId, onSelect, markerMode, onMarkerModeChange }: ObjectsPanelProps) {
  const [sortKey, setSortKey] = useState<ObjectSortKey>('snr')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const listRef = useRef<HTMLUListElement>(null)
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map())

  const objects = Array.isArray(file?.objects) ? file.objects : NO_OBJECTS
  const sorted = useMemo(() => sortObjects(objects, sortKey, sortDir), [objects, sortKey, sortDir])

  // Keep the selected row visible inside the list (scrolls the list only, not the page).
  useEffect(() => {
    const list = listRef.current
    const row = selectedObjectId ? rowRefs.current.get(selectedObjectId) : undefined
    if (!list || !row) return
    const top = row.offsetTop
    if (top < list.scrollTop) list.scrollTop = top
    else if (top + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + row.offsetHeight - list.clientHeight
  }, [selectedObjectId])

  if (!file) {
    return (
      <section aria-label="Objects in this patch" className="rounded-xl border border-sky-border bg-sky-surface p-4 text-sm text-sky-inkDim">
        No object data for this patch.
      </section>
    )
  }

  const nKnown = objects.filter(o => o.kind === 'known').length
  const nUnidentified = objects.filter(o => o.kind === 'unidentified').length
  const nMoving = objects.filter(o => o.moving).length
  const nHighlights = objects.filter(isHighlight).length
  const selected = selectedObjectId ? objects.find(o => o.id === selectedObjectId) ?? null : null

  const clickSort = (key: ObjectSortKey) => {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'snr' || key === 'pm' ? 'desc' : 'asc')
    }
  }

  return (
    <section aria-labelledby="objects-h" className="rounded-xl border border-sky-border bg-sky-surface p-4 text-sm" data-testid="objects-panel">
      <h2 id="objects-h" className="text-base font-semibold text-sky-ink">Objects in this patch</h2>
      <p className="mt-1 text-sky-inkDim">
        <span className="font-mono text-sky-ink">{nKnown}</span> known ·{' '}
        <span className="font-mono text-sky-ink">{nUnidentified}</span> unidentified ·{' '}
        <span className="font-mono text-sky-ink">{nMoving}</span> fast-moving
      </p>

      <fieldset className="mt-3">
        <legend className="mb-1.5 text-sky-inkDim">Markers on the image</legend>
        <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-sky-border">
          {MARKER_MODES.map((m, i) => (
            <label key={m.id}
              className={`flex min-h-11 sm:min-h-9 cursor-pointer items-center justify-center px-2 text-center transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-sky-accent ${
                i > 0 ? 'border-l border-sky-border' : ''
              } ${markerMode === m.id ? 'bg-sky-accent/15 text-sky-accent' : 'text-sky-inkDim hover:text-sky-ink'}`}>
              <input type="radio" name="marker-mode" value={m.id} checked={markerMode === m.id}
                onChange={() => onMarkerModeChange(m.id)} className="sr-only" />
              {m.label}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-sky-inkDim">
          {markerMode === 'highlights'
            ? `Showing the ${nHighlights} fast-moving or unidentified object${nHighlights === 1 ? '' : 's'}.`
            : markerMode === 'all' ? `Showing all ${objects.length} objects.` : 'Only the selected object is marked.'}
        </p>
      </fieldset>

      <div className="mt-4 mb-2 flex flex-wrap gap-1" role="group" aria-label="Sort the list">
        {SORT_BUTTONS.map(b => {
          const active = sortKey === b.key
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => clickSort(b.key)}
              aria-pressed={active}
              className={`flex min-h-10 sm:min-h-8 items-center gap-0.5 rounded border px-2.5 text-xs transition-colors ${
                active
                  ? 'border-sky-accent/50 bg-sky-accent/15 text-sky-accent'
                  : 'border-sky-border text-sky-inkDim hover:border-sky-accent/40 hover:text-sky-ink'
              }`}
            >
              {b.label}
              {active && (sortDir === 'asc'
                ? <ArrowUp className="h-3 w-3" aria-label="ascending" />
                : <ArrowDown className="h-3 w-3" aria-label="descending" />)}
            </button>
          )
        })}
      </div>

      {sorted.length === 0 ? (
        <p className="text-sky-inkDim">No objects detected in this patch.</p>
      ) : (
        <ul ref={listRef} className="relative max-h-80 space-y-0.5 overflow-y-auto" aria-label="Objects, select one for details">
          {sorted.map(o => {
            const isSel = o.id === selectedObjectId
            return (
              <li
                key={o.id}
                ref={el => {
                  if (el) rowRefs.current.set(o.id, el)
                  else rowRefs.current.delete(o.id)
                }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(o.id)}
                  aria-current={isSel ? 'true' : undefined}
                  data-object-id={o.id}
                  className={`grid min-h-11 w-full grid-cols-[30px_1fr_auto] items-center gap-2 rounded px-1.5 py-1 text-left transition-colors ${
                    isSel ? 'bg-sky-accent/15 ring-1 ring-sky-accent/40' : 'hover:bg-sky-bg/60'
                  }`}
                >
                  <MarkerSwatch
                    shape={o.kind === 'known' ? 'circle' : 'square'}
                    color={o.kind === 'known' ? MARKER_STYLE.known : MARKER_STYLE.unidentified}
                    moving={o.moving}
                    selected={isSel}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sky-ink">{o.name || o.id}</span>
                    <span className="block text-xs text-sky-inkDim">
                      {o.kind === 'known' ? 'Known' : 'Unidentified'}{o.moving ? ' · fast-moving' : ''}
                    </span>
                  </span>
                  <span className="text-right font-mono text-xs leading-tight">
                    <span className="block text-sky-ink">{formatPm(o.pm_mas_yr ?? null)}</span>
                    <span className="block text-sky-inkDim">
                      <abbr title="signal-to-noise: how clearly it stands out from the background" className="no-underline">S/N</abbr>{' '}
                      {typeof o.snr === 'number' ? o.snr.toFixed(0) : '—'}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {selected && (
        <ObjectDetails object={selected} thresholds={file.thresholds} meanEpochMjd={file.mean_epoch_mjd} onClose={() => onSelect(null)} />
      )}
    </section>
  )
}
