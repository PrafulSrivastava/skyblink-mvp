/**
 * Plain-language definitions for every technical term shown in the UI.
 * Used by the hover/focus/tap tooltips in components/Term.tsx.
 */

export interface GlossaryEntry {
  term: string
  def: string
}

export const GLOSSARY = {
  // Views and controls
  blink: { term: 'Blink', def: 'Flipping between pictures of the same sky taken at different times. Anything that moved or changed brightness jumps out.' },
  diff: { term: 'Diff (difference image)', def: 'The later image minus the earlier one. Things that did not change cancel out; orange shows where it is brighter now, blue where it was brighter before.' },
  spectrum: { term: 'Spectrum', def: 'How bright an object is at each wavelength. Dips show molecules such as water or methane in its atmosphere.' },
  longBaseline: { term: '16 years of motion', def: 'A 2010 image from NASA’s WISE survey blinked against a SPHEREx image of the same sky, so slow motion adds up to something you can see.' },
  highlights: { term: 'Highlights', def: 'Only mark the objects worth a look: fast movers and objects missing from every catalogue we checked.' },
  markersAll: { term: 'All markers', def: 'Mark every object detected in this patch of sky.' },
  markersOff: { term: 'No markers', def: 'Hide the markers to see the raw image. A selected object stays marked.' },
  liveView: { term: 'Live view', def: 'Images fetched from NASA’s archive the moment you ask, for any position. Nothing is prepared or checked in advance, so objects are not labelled.' },
  exposure: { term: 'Exposure', def: 'One single picture taken by the telescope. SkyBlink turns each one north-up and averages the ones from the same visit.' },
  irsa: { term: 'IRSA', def: 'NASA’s Infrared Science Archive at Caltech/IPAC, where SPHEREx and WISE images are kept for anyone to use.' },

  // Instruments, surveys and catalogues
  spherex: { term: 'SPHEREx', def: 'A NASA space telescope launched in March 2025. It maps the whole sky in 102 infrared colours and returns to each spot about every six months.' },
  wise: { term: 'WISE', def: 'NASA’s Wide-field Infrared Survey Explorer. It mapped the whole sky in infrared in 2010; its images give the “before” picture.' },
  neowise: { term: 'NEOWISE', def: 'The WISE telescope’s later mission (2013–2024), which kept rescanning the sky.' },
  gaia: { term: 'Gaia DR3', def: 'The European Space Agency’s Gaia catalogue: precise positions and motions for about 1.8 billion stars. Used here for how fast each star moves.' },
  catwise: { term: 'CatWISE2020', def: 'A catalogue built from WISE and NEOWISE images that measures motion for faint, cold objects Gaia cannot see, such as WISE 0855.' },
  allwise: { term: 'AllWISE', def: 'A catalogue of nearly 750 million infrared sources from the WISE survey.' },
  twomass: { term: '2MASS', def: 'The Two Micron All Sky Survey, a 1997–2001 map of the sky in near-infrared light.' },
  catalogue: { term: 'Catalogue', def: 'A published list of stars and other objects with their positions, brightness and motion.' },
  dr1qr3: { term: 'DR1 and QR3', def: 'SPHEREx data releases: DR1 is the first full release, QR3 a quick release with newer images.' },
  fits: { term: 'FITS files', def: 'The standard file format for astronomy images. Raw SPHEREx files are about 65 MB each and need special software to read.' },

  // Sky geometry and units
  arcsecond: { term: 'Arcsecond (″)', def: 'A tiny angle: 1/3600 of a degree. The full Moon is about 1,800″ across.' },
  arcminute: { term: 'Arcminute (′)', def: '1/60 of a degree. 5′ is about a sixth of the full Moon’s width.' },
  pixelScale: { term: '6.15″ per pixel', def: 'Each pixel in these images covers 6.15 arcseconds of sky, so a star must move about 6″ to shift one pixel.' },
  northUp: { term: 'North up', def: 'Every image is turned so north is at the top and east at the left, the way the sky looks from Earth. That keeps background stars still between frames.' },
  ra: { term: 'RA (right ascension)', def: 'Position on the sky east–west, like longitude, measured in hours, minutes and seconds.' },
  dec: { term: 'Dec (declination)', def: 'Position on the sky north–south, like latitude, measured in degrees from the celestial equator.' },
  epoch: { term: 'Epoch', def: 'The date a position refers to. A star’s position changes with time, so positions are always given for a date.' },
  micron: { term: 'µm (micrometre)', def: 'A millionth of a metre, the unit for infrared wavelengths. Visible light is 0.4–0.7 µm; SPHEREx sees 0.75–5 µm.' },
  microjansky: { term: 'µJy (microjansky)', def: 'A unit of brightness used in astronomy. Bigger means brighter.' },
  magnitude: { term: 'Magnitude', def: 'The astronomers’ brightness scale. Smaller numbers are brighter, and 5 magnitudes is a factor of 100.' },
  gMag: { term: 'Gaia G', def: 'Brightness in Gaia’s broad visible-light band, as a magnitude: smaller is brighter.' },
  infrared: { term: 'Infrared', def: 'Light with longer wavelengths than red, invisible to our eyes. Cool objects such as brown dwarfs shine mostly in infrared.' },

  // Motion
  properMotion: { term: 'Proper motion', def: 'How fast a star crawls across the sky. Only nearby stars move enough to notice.' },
  masPerYear: { term: 'mas/yr', def: 'Milliarcseconds per year: thousandths of an arcsecond each year. Barnard’s Star moves about 10,400 mas/yr, or 10″ a year.' },
  pmRa: { term: 'μα·cosδ', def: 'The east–west part of a star’s motion, corrected so it is a true angle on the sky.' },
  pmDec: { term: 'μδ', def: 'The north–south part of a star’s motion.' },
  fastMover: { term: 'Fast mover', def: 'An object moving more than 1″ a year in the catalogues, or one that visibly shifts between the images.' },
  predictedShift: { term: 'Predicted shift', def: 'How far the star should move between the first and last visit, worked out from its catalogue motion.' },
  measuredShift: { term: 'Measured shift', def: 'How far the star actually moved in these images, found by fitting its position in each one.' },
  fitOffset: { term: 'Fit vs prediction', def: 'How far the measured position lands from the predicted one, in pixels. Under one pixel means they agree.' },
  staleCoordinate: { term: 'Out-of-date position', def: 'Catalogue positions are for a past date. A fast star has moved since, so the old coordinate points at empty sky.' },
  baseline: { term: 'Time between images', def: 'The longer the gap between two images, the further a star moves and the easier the motion is to see.' },

  // Images and data quality
  band: { term: 'Band', def: 'A range of wavelengths. SPHEREx has six detectors, D1 to D6, from just past red light (D1) to the longest infrared (D6), where cold objects show best.' },
  visit: { term: 'Visit', def: 'SPHEREx passes over each spot about every six months. All images from one pass are stacked into one picture.' },
  partialVisit: { term: 'Partial visit', def: 'A pass with only a few images of this spot, so the stacked picture is noisier than a full visit.' },
  framesStacked: { term: 'Frames stacked', def: 'How many separate exposures were averaged into this picture. More frames means less noise.' },
  saturated: { term: 'Saturated', def: 'Too bright for the detector. The centre of the star is masked because those pixel values are not reliable.' },
  snr: { term: 'S/N (signal-to-noise)', def: 'How clearly an object stands out from the background noise. Above about 5 counts as a real detection.' },
  comparisonStar: { term: 'Comparison star', def: 'A nearby star that should not move. If it shows no colour pair in the Diff view, the target’s pair is real motion and not an alignment error.' },
  known: { term: 'Known', def: 'Matched to an entry in CatWISE, AllWISE or 2MASS within a few arcseconds.' },
  unidentified: { term: 'Unidentified', def: 'Detected here but with no match in CatWISE, AllWISE or 2MASS. It may be faint, blended or an artefact; it is not a discovery claim.' },
  predictedPosition: { term: 'Predicted position', def: 'Where the target should be on this date, worked out from its catalogue position and motion.' },
  stretch: { term: 'Image stretch', def: 'How pixel values map to brightness on screen. Each image gets its own stretch so faint and bright parts both show.' },
  psfWing: { term: 'PSF wings', def: 'The faint glow around a star’s image. When the centre is saturated, the wings still carry usable light.' },
  coadd: { term: 'Stacking', def: 'Averaging many exposures of the same sky to reduce noise.' },
  channel: { term: 'Channel', def: 'One of SPHEREx’s 102 narrow wavelength slices between 0.75 and 5 µm.' },

  // Objects
  redDwarf: { term: 'Red dwarf', def: 'A small, cool star, the most common kind in our galaxy.' },
  brownDwarf: { term: 'Brown dwarf', def: 'An object between a planet and a star: too small to burn hydrogen like the Sun, so it slowly cools and glows in infrared.' },
  tTauri: { term: 'T Tauri star', def: 'A very young star, a few million years old, still pulling in gas from the disc it formed from.' },
  mira: { term: 'Mira variable', def: 'An old giant star that swells and shrinks over months, changing brightness as it goes.' },
  methane: { term: 'Methane (CH₄)', def: 'A molecule that absorbs light at 3.3 µm. It only forms in very cool atmospheres, like those of brown dwarfs and giant planets.' },
  lightYear: { term: 'Light-year', def: 'The distance light travels in a year, about 9.5 trillion km.' },
} satisfies Record<string, GlossaryEntry>

export type GlossaryKey = keyof typeof GLOSSARY

/** Tooltip text for a SPHEREx detector band chip. */
export const BAND_TIPS: Record<string, GlossaryEntry> = {
  D1: { term: 'Band D1 · 0.75–1.09 µm', def: 'Just past red light. Closest to what our eyes see.' },
  D2: { term: 'Band D2 · 1.10–1.62 µm', def: 'Near-infrared. Good for ordinary stars.' },
  D3: { term: 'Band D3 · 1.63–2.42 µm', def: 'Near-infrared. Brown dwarfs start to stand out.' },
  D4: { term: 'Band D4 · 2.42–3.82 µm', def: 'Infrared. Includes the 3.3 µm methane band.' },
  D5: { term: 'Band D5 · 3.82–4.42 µm', def: 'Mid-infrared. Cold objects get brighter here.' },
  D6: { term: 'Band D6 · 4.42–5.00 µm', def: 'The longest SPHEREx band. Best for the coldest objects, such as WISE 0855.' },
}
