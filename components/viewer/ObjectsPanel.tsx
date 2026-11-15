'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { SkyObjectsFile, SkyObject } from '@/lib/sky-objects'
import { MARKER_STYLE } from '@/lib/object-overlay'
import { sortObjects, formatPm, type ObjectSortKey, type SortDir } from '@/lib/object-list'
import ObjectDetails from './ObjectDetails'

interface ObjectsPanelProps {
  file: SkyObjectsFile | null
  selectedObjectId: string | null
  onSelect: (id: string | null) => void
  showMarkers: boolean
  onToggleMarkers: (v: boolean) => void
}

const SORT_BUTTONS: { key: ObjectSortKey; label: string }[] = [
  { key: 'snr', label: 'S/N' },
  { key: 'kind', label: 'Category' },
  { key: 'name', label: 'Name' },
  { key: 'pm', label: 'Proper motion' },
]

const NO_OBJECTS: readonly SkyObject[] = []

/** Row swatch: same colour, moving ring and selection ring as the canvas marker. */
function RowSwatch({ obj, selected }: { obj: SkyObject; selected: boolean }) {
  const color = obj.kind === 'known' ? MARKER_STYLE.known : MARKER_STYLE.unidentified
  return (
    <svg width={28} height={28} viewBox="0 0 28 28" className="flex-shrink-0" aria-hidden="true" data-swatch={obj.kind}>
      <circle cx={14} cy={14} r={MARKER_STYLE.baseRadius} fill="none" stroke={color} strokeWidth={MARKER_STYLE.lineWidth} />
      {obj.moving && (
        <circle
          cx={14} cy={14} r={MARKER_STYLE.movingRadius} fill="none" stroke={color}
          strokeWidth={MARKER_STYLE.lineWidth} strokeDasharray={MARKER_STYLE.movingDash.join(' ')}
        />
      )}
      {selected && (
        <circle cx={14} cy={14} r={MARKER_STYLE.selectedRadius} fill="none" stroke={MARKER_STYLE.selected} strokeWidth={MARKER_STYLE.lineWidth} />
      )}
    </svg>
  )
}

export default function ObjectsPanel({ file, selectedObjectId, onSelect, showMarkers, onToggleMarkers }: ObjectsPanelProps) {
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
      <div className="bg-sky-surface rounded-lg border border-sky-border p-3 text-xs text-sky-inkDim">
        No object data for this patch
      </div>
    )
  }

  const nKnown = objects.filter(o => o.kind === 'known').length
  const nUnidentified = objects.filter(o => o.kind === 'unidentified').length
  const nMoving = objects.filter(o => o.moving).length
  const selected = selectedObjectId ? objects.find(o => o.id === selectedObjectId) ?? null : null

  const clickSort = (key: ObjectSortKey) => {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'snr' || key === 'pm' ? 'desc' : 'asc')
    }
  }

  return (
    <div className="bg-sky-surface rounded-lg border border-sky-border p-3 text-xs" data-testid="objects-panel">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="text-sky-inkDim text-[10px] font-mono uppercase tracking-wider mb-1">Sky objects</div>
          <div className="text-sky-ink">
            <span className="font-mono">{nKnown}</span> known ·{' '}
            <span className="font-mono">{nUnidentified}</span> unidentified ·{' '}
            <span className="font-mono">{nMoving}</span> high proper motion
          </div>
        </div>
        <label className="flex items-center gap-1.5 text-sky-inkDim cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={showMarkers}
            onChange={e => onToggleMarkers(e.target.checked)}
            className="accent-sky-accent"
          />
          Show markers
        </label>
      </div>

      <div className="flex flex-wrap gap-1 mb-2" role="group" aria-label="Sort objects">
        {SORT_BUTTONS.map(b => {
          const active = sortKey === b.key
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => clickSort(b.key)}
              aria-pressed={active}
              className={`flex items-center gap-0.5 px-2 py-1 rounded border text-[11px] transition-colors ${
                active
                  ? 'bg-sky-accent/15 border-sky-accent/50 text-sky-accent'
                  : 'border-sky-border text-sky-inkDim hover:text-sky-ink hover:border-sky-accent/40'
              }`}
            >
              {b.label}
              {active && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
            </button>
          )
        })}
      </div>

      {sorted.length === 0 ? (
        <div className="text-sky-inkDim">No objects detected in this patch</div>
      ) : (
        <ul ref={listRef} className="max-h-80 overflow-y-auto relative space-y-0.5" aria-label="Sky objects">
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
                  className={`w-full grid grid-cols-[28px_1fr_auto] items-center gap-2 px-1.5 py-1 rounded text-left transition-colors ${
                    isSel ? 'bg-sky-accent/15 ring-1 ring-sky-accent/40' : 'hover:bg-sky-bg/60'
                  }`}
                >
                  <RowSwatch obj={o} selected={isSel} />
                  <span className="min-w-0">
                    <span className="block text-sky-ink truncate">{o.name || o.id}</span>
                    <span className="block text-sky-inkDim text-[10px]">
                      {o.kind === 'known' ? 'Known' : 'Unidentified'}
                    </span>
                  </span>
                  <span className="text-right font-mono text-[10px] leading-tight">
                    <span className="block text-sky-ink">{formatPm(o.pm_mas_yr ?? null)}</span>
                    <span className="block text-sky-inkDim">
                      S/N {typeof o.snr === 'number' ? o.snr.toFixed(1) : '—'}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {selected && (
        <ObjectDetails object={selected} thresholds={file.thresholds} onClose={() => onSelect(null)} />
      )}
    </div>
  )
}
