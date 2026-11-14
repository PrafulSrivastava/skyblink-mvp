// Hardcoded vetted target table - covers all 5 challenge targets
// Proper motion values from Gaia DR3 / CatWISE2020
// pmra includes cos(dec) factor (Gaia convention)

export interface Target {
  id: string
  name: string
  ra: number       // degrees, J2000
  dec: number      // degrees, J2000
  pmra: number     // mas/yr (includes cos dec)
  pmdec: number    // mas/yr
  refEpoch: number // Julian year (Gaia: 2016.0, CatWISE: ~2015.4)
  source: 'gaia_dr3' | 'catwise2020' | 'hardcoded'
  defaultBand: 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6'
  description: string
  saturated: boolean
  brief?: string   // brief/catalogue coordinate if stale
}

export const TARGETS: Target[] = [
  {
    id: 'barnards-star',
    name: "Barnard's Star",
    ra: 269.4521,
    dec: 4.6933,
    pmra: -801.551, // mas/yr incl cos dec
    pmdec: 10362.394,
    refEpoch: 2016.0,
    source: 'gaia_dr3',
    defaultBand: 'D2', // least-saturated band
    description: 'Fastest-moving star in the sky. 10″/yr proper motion visible in SPHEREx.',
    saturated: true,
  },
  {
    id: 'epsilon-indi-b',
    name: 'Epsilon Indi B',
    ra: 330.8498,
    dec: -56.7867,
    pmra: 3961.80,
    pmdec: -2538.43,
    refEpoch: 2016.0,
    source: 'gaia_dr3',
    defaultBand: 'D3',
    description: 'T1+T6 brown dwarf binary. Unsaturated — best target for the 3.3 µm CH₄ spectrum.',
    saturated: false,
  },
  {
    id: 'wise-0855',
    name: 'WISE 0855−0714',
    ra: 133.7847,   // 08h55m08.3s (Gaia/CatWISE epoch 2016.0)
    dec: -7.2448,   // -07°14′41″
    pmra: -8081.0,  // mas/yr
    pmdec: -721.0,
    refEpoch: 2015.4, // CatWISE2020
    source: 'catwise2020',
    defaultBand: 'D6',
    description: 'Coldest known brown dwarf (~250 K). Only detectable in D6 (>4 µm). Brief coordinate is 2.1′ stale.',
    saturated: false,
    brief: '08h55m10.831s -07d14m42.53s', // The challenge brief coordinate
  },
  {
    id: 'rw-aurigae',
    name: 'RW Aurigae',
    ra: 83.0956,
    dec: 30.4017,
    pmra: -1.2,
    pmdec: -25.9,
    refEpoch: 2016.0,
    source: 'gaia_dr3',
    defaultBand: 'D2',
    description: 'T Tauri variable star. Story is photometric variability per visit, not motion.',
    saturated: true,
  },
  {
    id: 'r-draconis',
    name: 'R Draconis',
    ra: 271.5375,
    dec: 68.0381,
    pmra: -26.4,
    pmdec: -4.1,
    refEpoch: 2016.0,
    source: 'gaia_dr3',
    defaultBand: 'D2',
    description: 'Mira-type variable giant. Brightness varies by >6 mag. Saturated core.',
    saturated: true,
  },
]

export function getTarget(id: string): Target | undefined {
  return TARGETS.find(t => t.id === id)
}

// Apply proper motion correction to epoch
export function applyProperMotion(
  target: Target,
  toEpochJD: number // Julian date
): { ra: number; dec: number; offsetArcsec: number } {
  const toEpochYear = 2000.0 + (toEpochJD - 2451545.0) / 365.25
  const dtYears = toEpochYear - target.refEpoch
  
  const decRad = (target.dec * Math.PI) / 180
  const cosDec = Math.cos(decRad)
  
  // pmra already includes cos(dec) in Gaia convention
  const dra = (target.pmra / 3600000) * dtYears / cosDec
  const ddec = (target.pmdec / 3600000) * dtYears
  
  const newRa = target.ra + dra
  const newDec = target.dec + ddec
  
  // Total offset in arcsec
  const offsetArcsec = Math.sqrt(
    (target.pmra * dtYears / 1000) ** 2 + 
    (target.pmdec * dtYears / 1000) ** 2
  )
  
  return { ra: newRa, dec: newDec, offsetArcsec }
}

// Parse RA in various formats to decimal degrees
export function parseRA(ra: string): number | null {
  // Decimal degrees
  const decimal = parseFloat(ra)
  if (!isNaN(decimal) && !ra.includes(':') && !ra.includes('h')) return decimal
  
  // HH:MM:SS or HHhMMmSSs
  const sexMatch = ra.match(/^(\d+)[h:](\d+)[m:](\d+\.?\d*)[s]?$/)
  if (sexMatch) {
    const h = parseFloat(sexMatch[1])
    const m = parseFloat(sexMatch[2])
    const s = parseFloat(sexMatch[3])
    return (h + m / 60 + s / 3600) * 15
  }
  return null
}

export function parseDec(dec: string): number | null {
  const decimal = parseFloat(dec)
  if (!isNaN(decimal) && !dec.includes(':') && !dec.includes('d')) return decimal
  
  const sexMatch = dec.match(/^([+-]?\d+)[d:](\d+)[m':](\d+\.?\d*)[s"]?$/)
  if (sexMatch) {
    const sign = sexMatch[0].startsWith('-') ? -1 : 1
    const d = Math.abs(parseFloat(sexMatch[1]))
    const m = parseFloat(sexMatch[2])
    const s = parseFloat(sexMatch[3])
    return sign * (d + m / 60 + s / 3600)
  }
  return null
}
