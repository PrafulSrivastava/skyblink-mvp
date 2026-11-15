/**
 * Plain-language copy for the five targets, shared by the landing page, the viewer and the
 * 16-year page. `tech` keeps the measured numbers for people who want them.
 * Terms are marked [[shown text|glossaryKey]] and rendered as tooltips by <RichText> (components/Term.tsx);
 * use plainText() where markup cannot render.
 */
import type { BundleTargetId } from './bundle-loader'

export interface TargetStory {
  name: string
  /** What kind of object, in everyday words */
  kind: string
  /** Short label for chips and badges */
  tag: string
  /** One or two sentences: why this object is interesting */
  story: string
  /** What to do in the viewer to see it */
  tip: string
  /** The measured detail, for experts */
  tech: string
}

export const TARGET_STORIES: Record<BundleTargetId, TargetStory> = {
  'barnards-star': {
    name: "Barnard's Star",
    kind: '[[Red dwarf|redDwarf]] star, 6 [[light-years|lightYear]] away',
    tag: 'Fastest-moving star',
    story: 'The fastest-moving star in our sky. It drifts about 10 [[arcseconds|arcsecond]] a year, so across one year of [[SPHEREx|spherex]] images it shifts by less than two pixels.',
    tip: 'Switch to [[Diff|diff]] to see the shift as a blue–orange pair, or open the [[16-year view|longBaseline]] to watch it cross the frame.',
    tech: '10,362 [[mas/yr|masPerYear]] ([[Gaia DR3|gaia]]). [[Measured|measuredShift]] 1.54 px in [[band|band]] D2 against 1.67 px [[predicted|predictedShift]]. The core is [[saturated|saturated]], so the fit uses the [[outer glow|psfWing]].',
  },
  'eps-indi-b': {
    name: 'Epsilon Indi B',
    kind: 'Pair of [[brown dwarfs|brownDwarf]], 12 [[light-years|lightYear]] away',
    tag: 'Methane in its light',
    story: 'Two “failed stars”, too small to burn hydrogen. They are cool enough for [[methane|methane]] to form in their atmospheres, which shows up as a dip in their [[infrared|infrared]] light.',
    tip: 'Open [[Spectrum|spectrum]] to see the methane dip at 3.3 [[µm|micron]].',
    tech: 'T1 + T6 binary, not [[saturated|saturated]]. [[CH₄|methane]] absorption at 3.3 [[µm|micron]] in the 102-[[channel|channel]] [[spectrum|spectrum]].',
  },
  'wise-0855': {
    name: 'WISE 0855−0714',
    kind: 'Coldest known [[brown dwarf|brownDwarf]], 7 [[light-years|lightYear]] away',
    tag: 'Out-of-date position',
    story: 'About as cold as a freezer (roughly −25 °C) and visible only at the longest [[infrared|infrared]] wavelengths. Its published position is [[so out of date|staleCoordinate]] that it sits 2 [[arcminutes|arcminute]] from where the object is today.',
    tip: 'The viewer opens in [[band|band]] D6, the only band where it shows up. The blue crosshair marks its [[predicted position|predictedPosition]] now.',
    tech: '[[Catalogue|catalogue]] coordinate is 125.7[[″|arcsecond]] (20 px) off; corrected with [[CatWISE2020|catwise]] motion. [[Signal-to-noise|snr]] about 10 in D6.',
  },
  'rw-aur': {
    name: 'RW Aurigae',
    kind: 'Young star, still forming ([[T Tauri|tTauri]] type)',
    tag: 'Changes brightness',
    story: 'A star only a few million years old, still wrapped in the disc of gas and dust it formed from. It flickers in brightness instead of moving.',
    tip: 'Step through the [[visits|visit]] and compare brightness. It is too far away to move visibly.',
    tech: '[[T Tauri|tTauri]] variable. Variability visible in [[band|band]] D1; other bands [[saturate|saturated]]. Same-[[channel|channel]] brightness compared across [[visits|visit]].',
  },
  'r-dra': {
    name: 'R Draconis',
    kind: 'Pulsating red giant ([[Mira variable|mira]])',
    tag: 'Too bright to measure directly',
    story: 'A giant star that swells and shrinks over about eight months, changing brightness as it goes. It is so bright that the centre of its image [[saturates|saturated]] [[SPHEREx|spherex]]’s detectors.',
    tip: 'The saturated centre is masked; the [[glow around it|psfWing]] is what tracks its brightness.',
    tech: '[[Mira variable|mira]]. All 515 frames [[saturated|saturated]]; the [[PSF-wing|psfWing]] ratio is a brightness proxy (±0.3 [[mag|magnitude]] floor).',
  },
}

/** SPHEREx detector bands in everyday terms. */
export const BAND_INFO: Record<string, { range: string; plain: string }> = {
  D1: { range: '0.75–1.09 µm', plain: 'just past red light' },
  D2: { range: '1.10–1.62 µm', plain: 'near-infrared' },
  D3: { range: '1.63–2.42 µm', plain: 'near-infrared' },
  D4: { range: '2.42–3.82 µm', plain: 'infrared' },
  D5: { range: '3.82–4.42 µm', plain: 'mid-infrared' },
  D6: { range: '4.42–5.00 µm', plain: 'mid-infrared, coolest objects' },
}
