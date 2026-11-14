import type { ViewerState, Band } from './types'

const API_BASE = '/api/sky'

export async function resolveTarget(params: {
  targetId?: string
  ra?: number
  dec?: number
  name?: string
}) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'resolve', ...params }),
  })
  if (!res.ok) throw new Error(`resolve failed: ${res.status}`)
  return res.json()
}

export async function fetchFrames(params: {
  targetId?: string
  ra?: number
  dec?: number
}) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'frames', ...params }),
  })
  if (!res.ok) throw new Error(`frames failed: ${res.status}`)
  return res.json()
}

export async function fetchStack(params: {
  targetId?: string
  ra?: number
  dec?: number
  band?: Band
  nVisits?: number
}) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'stack', ...params }),
  })
  if (!res.ok) throw new Error(`stack failed: ${res.status}`)
  return res.json()
}

export async function fetchSpectrum(params: {
  targetId?: string
  ra?: number
  dec?: number
  visitIds?: string[]
}) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'spectrum', ...params }),
  })
  if (!res.ok) throw new Error(`spectrum failed: ${res.status}`)
  return res.json()
}

// URL state serialization
export function serializeState(state: Partial<ViewerState>): string {
  const params = new URLSearchParams()
  if (state.targetId) params.set('target', state.targetId)
  if (state.ra != null) params.set('ra', state.ra.toFixed(6))
  if (state.dec != null) params.set('dec', state.dec.toFixed(6))
  if (state.fov) params.set('fov', state.fov.toString())
  if (state.band) params.set('band', state.band)
  if (state.mode) params.set('mode', state.mode)
  if (state.visitA) params.set('va', state.visitA)
  if (state.visitB) params.set('vb', state.visitB)
  if (state.frameIndex != null) params.set('fi', state.frameIndex.toString())
  if (state.baselineOn) params.set('baseline', '1')
  if (state.overlaysOn) params.set('overlays', '1')
  if (state.spectrumRa != null) params.set('sra', state.spectrumRa.toFixed(6))
  if (state.spectrumDec != null) params.set('sdec', state.spectrumDec.toFixed(6))
  return params.toString()
}

export function deserializeState(search: string): Partial<ViewerState> {
  const params = new URLSearchParams(search)
  const state: Partial<ViewerState> = {}
  if (params.get('target')) state.targetId = params.get('target')!
  if (params.get('ra')) state.ra = parseFloat(params.get('ra')!)
  if (params.get('dec')) state.dec = parseFloat(params.get('dec')!)
  if (params.get('fov')) state.fov = parseFloat(params.get('fov')!)
  if (params.get('band')) state.band = params.get('band') as Band
  if (params.get('mode')) state.mode = params.get('mode') as ViewerState['mode']
  if (params.get('va')) state.visitA = params.get('va')!
  if (params.get('vb')) state.visitB = params.get('vb')!
  if (params.get('fi')) state.frameIndex = parseInt(params.get('fi')!)
  if (params.get('baseline')) state.baselineOn = params.get('baseline') === '1'
  if (params.get('overlays')) state.overlaysOn = params.get('overlays') === '1'
  if (params.get('sra')) state.spectrumRa = parseFloat(params.get('sra')!)
  if (params.get('sdec')) state.spectrumDec = parseFloat(params.get('sdec')!)
  return state
}
