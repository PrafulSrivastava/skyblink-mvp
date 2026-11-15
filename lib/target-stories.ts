/**
 * Plain-language copy for the five targets, shared by the landing page, the viewer and the
 * 16-year page. `tech` keeps the measured numbers for people who want them.
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
    kind: 'Red dwarf star, 6 light-years away',
    tag: 'Fastest-moving star',
    story: 'The fastest-moving star in our sky. It drifts about 10 arcseconds a year, so across one year of SPHEREx images it shifts by less than two pixels.',
    tip: 'Switch to Diff to see the shift as a blue–orange pair, or open the 16-year view to watch it cross the frame.',
    tech: '10,362 mas/yr (Gaia DR3). Measured 1.54 px in band D2 against 1.67 px predicted. The core is saturated, so the fit uses the outer glow.',
  },
  'eps-indi-b': {
    name: 'Epsilon Indi B',
    kind: 'Pair of brown dwarfs, 12 light-years away',
    tag: 'Methane in its light',
    story: 'Two “failed stars”, too small to burn hydrogen. They are cool enough for methane to form in their atmospheres, which shows up as a dip in their infrared light.',
    tip: 'Open Spectrum to see the methane dip at 3.3 µm.',
    tech: 'T1 + T6 binary, unsaturated. CH₄ absorption at 3.3 µm in the 102-channel spectrum.',
  },
  'wise-0855': {
    name: 'WISE 0855−0714',
    kind: 'Coldest known brown dwarf, 7 light-years away',
    tag: 'Out-of-date position',
    story: 'About as cold as a freezer (roughly −25 °C) and visible only at the longest infrared wavelengths. Its published position is so out of date that it sits 2 arcminutes from where the object is today.',
    tip: 'The viewer opens in band D6, the only band where it shows up. The blue crosshair marks where it is now.',
    tech: 'Catalogue coordinate is 125.7″ (20 px) off; corrected with CatWISE2020 motion. Signal-to-noise about 10 in D6.',
  },
  'rw-aur': {
    name: 'RW Aurigae',
    kind: 'Young star, still forming',
    tag: 'Changes brightness',
    story: 'A star only a few million years old, still wrapped in the disc of gas and dust it formed from. It flickers in brightness instead of moving.',
    tip: 'Step through the visits and compare brightness. It is too far away to move visibly.',
    tech: 'T Tauri variable. Variability visible in D1; other bands saturate. Same-channel flux compared across visits.',
  },
  'r-dra': {
    name: 'R Draconis',
    kind: 'Pulsating red giant',
    tag: 'Too bright to measure directly',
    story: 'A giant star that swells and shrinks over about eight months, changing brightness as it goes. It is so bright that the centre of its image saturates SPHEREx’s detectors.',
    tip: 'The saturated centre is masked; the glow around it is what tracks its brightness.',
    tech: 'Mira variable. All 515 photometry frames saturated; the PSF-wing ratio is a brightness proxy (±0.3 mag floor).',
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
