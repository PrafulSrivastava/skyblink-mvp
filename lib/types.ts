export interface SkyFrame {
  obsId: string
  detector: 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6'
  mjd: number
  dateObs: string
  s3Key: string
  accessUrl: string
  release: 'DR1' | 'QR3'
  psfFwhm: number
  wavelengthMicron: number
  visitId: string
  visitType: 'full' | 'partial'
  bandCenter: number
}

export interface SkyVisit {
  visitId: string
  visitType: 'full' | 'partial'
  dateRange: { start: string; end: string }
  mjdMid: number
  frames: SkyFrame[]
  detectors: string[]
}

export interface StackResult {
  visitId: string
  band: string
  imageDataUrl: string  // base64 PNG
  width: number
  height: number
  wcs: SimpleWCS
  crosshairPx: { x: number; y: number }
  date: string
  nFrames: number
  saturatedFraction: number
  metadata: {
    obsIds: string[]
    psfFwhm: number
    release: string
  }
}

export interface DiffResult {
  imageDataUrl: string
  visitA: string
  visitB: string
  controlStarPx?: { x: number; y: number }
  dipoleOffsetPx?: number
  band: string
}

export interface SpectrumPoint {
  wavelengthMicron: number
  flux: number
  fluxErr: number
  visitId: string
  obsId: string
  flags: string[]
  saturated: boolean
}

export interface SimpleWCS {
  crpix: [number, number]
  crval: [number, number]
  cd: [[number, number], [number, number]]
  naxis: [number, number]
}

export interface ResolveResult {
  ra: number
  dec: number
  targetId?: string
  pmra?: number
  pmdec?: number
  refEpoch?: number
  source?: string
  staleOffsetArcsec?: number
  inputRa?: number
  inputDec?: number
}

export interface FramesResult {
  visits: SkyVisit[]
  totalFrames: number
  coverage: 'full' | 'partial' | 'none'
  message?: string
}

export type Band = 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6' | 'broadband'
export type ViewMode = 'blink' | 'diff' | 'sum'

export interface ViewerState {
  ra: number | null
  dec: number | null
  targetId: string | null
  fov: number  // arcmin
  band: Band
  mode: ViewMode
  visitA?: string
  visitB?: string
  frameIndex: number
  baselineOn: boolean
  overlaysOn: boolean
  spectrumRa?: number
  spectrumDec?: number
}

export const DEFAULT_STATE: ViewerState = {
  ra: null,
  dec: null,
  targetId: null,
  fov: 10,
  band: 'D3',
  mode: 'blink',
  frameIndex: 0,
  baselineOn: false,
  overlaysOn: false,
}

// Blink Battle types
export interface BattleRound {
  id: string
  type: 'asteroid' | 'fast-star'
  frames: string[]  // image data URLs
  truthPx: { x: number; y: number }  // hidden until reveal
  revealName: string
  revealUrl: string
  imageWidth: number
  imageHeight: number
  dates: string[]
}

export interface BattleScore {
  round: number
  tapPx: { x: number; y: number }
  truthPx: { x: number; y: number }
  distancePx: number
  timeSec: number
  points: number
}
