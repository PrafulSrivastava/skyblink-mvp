import type { BattleRound } from './types'

// Pre-built fast-star rounds using the 5 SPHEREx targets
// Images are generated synthetically (same engine as the viewer's precompute)
// Truth positions are the PM-corrected pixel coords at the later epoch

export const FAST_STAR_ROUNDS: BattleRound[] = [
  {
    id: 'round-barnards-1',
    type: 'fast-star',
    frames: [],  // populated at runtime from /api/sky
    truthPx: { x: 134, y: 118 },  // approximate, updated from API
    revealName: "Barnard's Star",
    revealUrl: 'https://en.wikipedia.org/wiki/Barnard%27s_Star',
    imageWidth: 256,
    imageHeight: 256,
    dates: ['2025-05-15', '2026-02-20'],
  },
  {
    id: 'round-wise0855-1',
    type: 'fast-star',
    frames: [],
    truthPx: { x: 128, y: 128 },
    revealName: 'WISE J085510.83−071442.5',
    revealUrl: 'https://en.wikipedia.org/wiki/WISE_0855%E2%88%920714',
    imageWidth: 256,
    imageHeight: 256,
    dates: ['2025-05-15', '2026-05-01'],
  },
  {
    id: 'round-epsilon-indi-1',
    type: 'fast-star',
    frames: [],
    truthPx: { x: 128, y: 128 },
    revealName: 'Epsilon Indi B',
    revealUrl: 'https://en.wikipedia.org/wiki/Epsilon_Indi',
    imageWidth: 256,
    imageHeight: 256,
    dates: ['2025-05-15', '2025-11-15'],
  },
  {
    id: 'round-rw-aur-1',
    type: 'fast-star',
    frames: [],
    truthPx: { x: 128, y: 128 },
    revealName: 'RW Aurigae',
    revealUrl: 'https://en.wikipedia.org/wiki/RW_Aurigae',
    imageWidth: 256,
    imageHeight: 256,
    dates: ['2025-05-15', '2025-11-15'],
  },
  {
    id: 'round-r-dra-1',
    type: 'fast-star',
    frames: [],
    truthPx: { x: 128, y: 128 },
    revealName: 'R Draconis',
    revealUrl: 'https://en.wikipedia.org/wiki/R_Draconis',
    imageWidth: 256,
    imageHeight: 256,
    dates: ['2025-05-15', '2025-11-15'],
  },
]
