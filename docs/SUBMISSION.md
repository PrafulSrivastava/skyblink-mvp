# NASA Space Apps Challenge 2026 – Project Submission

Challenge: **Planet X and SPHEREx**

## Project Name

**SkyBlink**

---

## High-Level Project Summary

SkyBlink is a web viewer that lets anyone "blink" SPHEREx images of a small patch of sky and see what changed. It marks every object in the patch, and it tells catalogued objects apart from unidentified ones.

For five patches of sky, the project does the following:

- **Blink comparison.** It shows SPHEREx Level-2 spectral images, in all six detector bands, as a time-ordered blink and difference view across the repeat visits.
- **Object detection.** The pipeline finds the point sources in a stack of all the frames. The viewer draws them as markers.
- **Known versus unidentified.** Each detection is cross-matched against CatWISE2020, AllWISE and 2MASS. An object with a catalog match is "known". One with no match in any catalog is an "unidentified" candidate.
- **Static versus moving.** Objects whose catalogued proper motion is 1,000 mas/yr or more are flagged "high proper motion".
- **Click for details.** Clicking an object, on the image or in the list, opens its catalog identity, magnitudes, proper motion, detection significance, and SIMBAD and IRSA links that are corrected for the epoch.

**How it addresses the challenge.** Planet X is the hypothetical undiscovered object in the outer Solar System, and finding it means finding things that move or that nobody has catalogued. SPHEREx scans the whole sky repeatedly, so the same patch is imaged several times. SkyBlink turns that repeat coverage into a tool for spotting the two things that matter for such a search: an object with no catalog counterpart, and an object that moves.

**Why it matters.** Raw SPHEREx files are large (about 60 MB each, 2040×2040 pixels with several extensions) and need specialist tools to read. SkyBlink precomputes the hard part and puts the result in a browser. A student or citizen scientist can see which objects in a patch are catalogued, which are not, and which are moving, without installing anything.

---

## Link to Project Demo

> **TODO before submitting:** record a ≤30-second video or a 7-slide deck, upload it somewhere public (YouTube unlisted, Google Drive "anyone with the link", or GitHub), and paste the link here. I have not made one.

Demo link: `<ADD PUBLIC LINK HERE>`

Suggested 30-second flow:

1. Open https://skyblink-mvp.vercel.app/viewer/?target=barnards-star
2. Play the blink so the frames flicker. Barnard's Star shifts between visits.
3. Turn on **Show markers**. Point out the known and unidentified colours in the legend.
4. Click Barnard's Star in the list to open its details (proper motion, SIMBAD and IRSA links).
5. Switch to Epsilon Indi B. It has 3 unidentified candidates.

---

## Link to Final Project

- Live site: https://skyblink-mvp.vercel.app
- Viewer: https://skyblink-mvp.vercel.app/viewer/?target=barnards-star
- Source code: https://github.com/PrafulSrivastava/skyblink-mvp

> **TODO before submitting:** the repository may be private. The challenge needs a link that works without permission or registration, so check that it opens in a private browser window.

---

## Detailed Project Description

### What it does

SkyBlink loads a 5-arcminute patch of sky (49×49 pixels at 6.15″ per pixel, SPHEREx's native pixel size) and shows it as a blinking sequence of real SPHEREx frames. On top of the image it draws markers for every detected object, with a different style for each category:

| Category pair | Meaning |
|---|---|
| **Known** vs **Unidentified** | Whether the detection has a counterpart in CatWISE2020, AllWISE or 2MASS |
| **Static** vs **Moving** | Whether the catalogued total proper motion is ≥ 1,000 mas/yr ("high proper motion") |

The five bundled patches are:

| Patch | Why it is included | Detected | Unidentified |
|---|---|---|---|
| Barnard's Star | Fastest-moving star in the sky, a clear case of motion | 46 | 0 |
| Epsilon Indi B | Nearby brown dwarf, high proper motion | 31 | 3 |
| WISE 0855−0714 | Coldest known brown dwarf, extremely faint in the near-infrared | 45 | 0 |
| RW Aurigae | Young variable star, a case of variability | 62 | 2 |
| R Draconis | Bright variable star, a case of saturated or masked cores | 5 | 0 |

### How it works

The design is "precompute in Python, draw in the browser".

1. **Data.** The pipeline reads SPHEREx Level-2 images from the public S3 bucket. It reprojects each visit onto a common 49×49 grid and co-adds the frames, giving per-band, per-visit PNG frames and difference images.
2. **Catalog snapshots.** `pipeline/objects/fetch_catalogs.py` is the only network step. It pulls CatWISE2020, AllWISE and 2MASS for each patch from IRSA Gator and commits them as CSV files, so the later steps are reproducible offline.
3. **Detection.** `detect.py` finds sources in the all-band, all-visit stack above a 5σ threshold, with masks for edges and bad pixels.
4. **Cross-match.** `match.py` matches each detection to CatWISE2020 first. Older catalogs are linked by propagating the CatWISE proper motion back to their epoch. A claimed motion that an older catalog row contradicts is suppressed.
5. **Output.** `make_objects.py` writes `objects.json` for each patch. It runs four consistency guards and records the thresholds, the catalog snapshot dates and a summary of counts (`pipeline/objects/reports/counts.txt`).
6. **Viewer.** The Next.js app loads `objects.json` independently of the image bundle, draws the markers on a canvas, runs hit-testing for clicks, and builds proper-motion-corrected links to SIMBAD and IRSA.

### Benefits

- Anyone can use it from a browser. No FITS tools and no large downloads.
- Results are traceable. Every object carries its catalog ID, separation and detection significance, and the thresholds are written out in the data.
- It is honest about limits. A target that is saturated is labelled "core masked" and not silently dropped. A target that is not detected is shown at its catalog position and marked as undetected.
- It has automated checks: 116 Python tests for the pipeline and a node:assert script for the viewer's pure functions.

### What we hope to achieve

A first step toward a tool for citizen-scientist hunts: flag what is uncatalogued and what moves, in real SPHEREx data. The next steps we have scoped are live search by arbitrary sky coordinates, a solar-system layer (known asteroids and planets) so that moving objects can be classified, and a wider field of view.

### Honest limitations

- **Five fixed patches.** Live coordinate search is not built. We tested reading cutouts directly from the public bucket (about 1.2 s for a 49-row strip), but IRSA's search service was down when we tried it.
- **Unidentified does not mean new.** It means "no match in CatWISE2020, AllWISE or 2MASS". These are candidates, and the next step would be to check Gaia or SIMBAD.
- **"Moving" comes from catalog proper motion**, not from motion measured in the SPHEREx frames. SPHEREx visits are only months apart, so they are too close in time to measure slow motion directly.
- **Solar-system bodies (comets, asteroids, planets) are not identified yet.**
- **Image resolution** is SPHEREx's native 6.15″ per pixel, upscaled in the viewer.

### Tools, languages, software

- **Frontend:** Next.js 16 (static export), React 19, TypeScript, Tailwind CSS 4, Radix UI, Recharts, canvas rendering.
- **Pipeline:** Python (NumPy, SciPy, Astropy, Astroquery, PyVO, Pillow).
- **Hosting:** Vercel.
- **Testing:** 116 Python tests for the pipeline, a node:assert script for the viewer helpers, and a Playwright walkthrough of the live site (20 of 20 checks passed).
- **Development process:** AI-assisted. The design, plan, implementation and review were done by Claude models with human direction and approval. See the AI note below.

---

## NASA Data

| NASA data or resource | How it was used |
|---|---|
| **SPHEREx Data Release 1 (DR1) Spectral Images**, doi:10.26131/IRSA678 | The Level-2 images (IMAGE, FLAGS, VARIANCE and WCS extensions) behind the blink frames, difference images and object detection |
| **SPHEREx Quick Release 3 (QR3) Spectral Images**, doi:10.26131/IRSA662 | Extra frames for targets where IRSA's SIA service returned them |
| **IRSA public AWS bucket** `s3://nasa-irsa-spherex` | The source of the SPHEREx files |
| **IRSA SIA service** | Finding which SPHEREx images cover each patch |
| **CatWISE2020** (NASA WISE/NEOWISE), doi:10.26131/IRSA551 | The main catalog for cross-matching and proper motion |
| **AllWISE** (NASA WISE), via IRSA Gator | An older-epoch catalog, linked to detections by back-propagating CatWISE proper motion |
| **2MASS** (NASA/IPAC and UMass), via IRSA Gator | A near-infrared catalog for cross-matching |
| **NASA/IPAC Infrared Science Archive (IRSA)** | Hosts all of the above and the Gator catalog service |

Required SPHEREx acknowledgement:

> This publication makes use of data products from the Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which is a joint project of the Jet Propulsion Laboratory and the California Institute of Technology, and is funded by the National Aeronautics and Space Administration.

> This research made use of the NASA/IPAC Infrared Science Archive, which is funded by NASA and operated by the California Institute of Technology.

---

## Space Agency Partner Data and Other References

### Space agency partner data

- **ESA Gaia DR3** (Gaia Collaboration, Vallenari et al. 2023, A&A 674, A1): astrometry for Barnard's Star, Epsilon Indi B, RW Aur and R Dra, and for the comparison stars. This work has made use of data from the European Space Agency (ESA) mission Gaia (https://www.cosmos.esa.int/gaia), processed by the Gaia Data Processing and Analysis Consortium (DPAC, https://www.cosmos.esa.int/web/gaia/dpac/consortium).

### Other data and references

- Marocco et al. 2021, ApJS 253, 8: CatWISE2020 catalog paper, cited for the proper motion of WISE 0855.
- SIMBAD (CDS, Strasbourg): link-out target from the object details panel. No SIMBAD data is bundled.
- Challenge resources page: https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/?tab=resources

### Software and libraries (all open source)

- Next.js, React, TypeScript, Tailwind CSS, Radix UI, Recharts, lucide-react, class-variance-authority, clsx, tailwind-merge.
- Python: NumPy, SciPy, Astropy, Astroquery, PyVO, Pillow.
- Playwright (for verification only).

### Code, text and images

- All application code and pipeline code were written for this project. The licence is in `LICENSE`.
- The images in the viewer are generated from NASA SPHEREx data by our pipeline. No third-party images, fonts or text were copied in.
- Icons come from lucide-react (ISC licence).

### AI assistance disclosure

Claude (Anthropic) models were used throughout development, including the design document, implementation plan, code, tests and code review. The author directed the work and approved the design and the deployment.

> **TODO before submitting:** check the AI disclosure against the Space Apps AI-use rules, and fill in the team name and members if the form asks for them.
