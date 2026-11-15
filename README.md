# SkyBlink

**See what changed in the infrared sky, and which objects nobody has catalogued.**

SkyBlink is a browser viewer for NASA's SPHEREx all-sky survey. It was built for the NASA Space Apps 2026 challenge *Planet X and SPHEREx*.

Live site: https://skyblink-mvp.vercel.app
Viewer: https://skyblink-mvp.vercel.app/viewer/?target=barnards-star

## The core idea

Hunting for something new in the sky, whether a distant planet or an unknown brown dwarf, comes down to two questions about each object:

1. **Is it catalogued?** Does it match anything we already know?
2. **Does it move?** Is it shifting against the background stars?

SPHEREx images every part of the sky several times, so the same patch is seen again and again. The raw files are about 60 MB each, 2040×2040 pixels, with several extensions. They need specialist tools to read.

SkyBlink does the heavy work ahead of time in Python and ships the result to a web page. In the browser you can see a patch of real SPHEREx data, see every detected object marked, and see at a glance which are known, which are unidentified, and which are fast movers.

## Why it helps

- **No FITS tools and no big downloads.** A student or citizen scientist opens a URL.
- **It points at the interesting objects.** A field holds dozens of sources. The viewer separates the ones with a catalog match from the few with none.
- **It shows its work.** Every object carries its catalog ID, separation, detection significance and proper motion. The thresholds and catalog snapshot dates are written into the data.
- **It is honest about limits.** A saturated or masked target is labelled "core masked". A target that is not detected is shown at its catalog position and marked as undetected.

## What you can do with it

### 1. Load a patch of sky

Pick one of five 5-arcminute patches (49×49 pixels at 6.15″ per pixel, SPHEREx's native pixel size):

| Patch | What it shows |
|---|---|
| Barnard's Star | The star with the fastest apparent motion in the sky, a clear case of motion |
| Epsilon Indi B | A nearby brown dwarf pair with high proper motion |
| WISE 0855−0714 | The coldest known brown dwarf, very faint in the near-infrared |
| RW Aurigae | A young variable star |
| R Draconis | A bright variable star, so its core is saturated |

### 2. Blink and compare

Play the frames as a loop. Anything that shifts between visits stands out. Choose among the six SPHEREx detector bands (D1 to D6, 0.75–5 µm) and view a difference image between visits.

### 3. See every identified object

Turn on **Show markers**. Each detection gets a marker, with two category pairs told apart by style:

| Pair | Meaning |
|---|---|
| **Known** vs **Unidentified** | Whether the object has a match in CatWISE2020, AllWISE or 2MASS |
| **Static** vs **Moving** | Whether its catalogued total proper motion is at least 1,000 mas/yr (shown as "high proper motion") |

Known objects are green and unidentified ones are pink. A dashed outer ring marks a moving object. A legend explains the markers and the list beside the image shows every object.

### 4. Click for details

Click a marker on the image, or a row in the list. The details panel shows the catalog identity, magnitudes, proper motion, separation, detection significance, and links to SIMBAD and IRSA. The links use the proper-motion-corrected position for the right epoch, so a fast mover is not looked up where it was in 2000.

### 5. Spectrum and motion measurement

Where the data are usable, a spectrum panel shows the SPHEREx spectrum of the target. The metadata panel reports the measured shift. Where a target is saturated, the panel says so and does not draw a misleading line.

### 6. Blink Battle

A game at `/battle`. Spot the moving star in real SPHEREx data and tap where you see the motion. Score is based on accuracy and speed.

## How to use it

1. Open https://skyblink-mvp.vercel.app and click **Open the viewer**, or go straight to `/viewer/?target=<id>`.
2. Choose a patch with the target chips at the top. Valid ids are `barnards-star`, `eps-indi-b`, `wise-0855`, `rw-aur` and `r-dra`.
3. Press play to blink. Pause on a frame to look closely.
4. Switch the band with the band picker, and open the difference view to see what changed between visits.
5. Turn on **Show markers**. Known objects are green and unidentified ones are pink. Look at the pink ones first. A dashed outer ring marks a high-proper-motion object.
6. Click an object for its details. Use the SIMBAD and IRSA links to check it elsewhere.

**Reading the result.** "Unidentified" means no match in CatWISE2020, AllWISE or 2MASS. It does not mean "new". It marks a candidate worth checking against Gaia or SIMBAD.

## What it does not do (yet)

- **Five fixed patches only.** Searching by arbitrary coordinates needs live archive services and is not part of the static site. `/live/` is an experimental test harness that fetches raw cutouts from IRSA for any position, but it is not the viewer and does no detection or matching. The home page text mentions coordinate search, but that is not available on the current static deployment.
- **"Moving" comes from catalog proper motion.** It is not measured from the SPHEREx frames, because the visits are only months apart.
- **No solar-system layer.** Comets, asteroids and planets are not identified.
- **Native resolution.** Images are upscaled in the viewer from 6.15″ per pixel.

## How it works

The design is "precompute in Python, draw in the browser".

```
SPHEREx Level-2 images (S3)  ->  reproject + co-add  ->  frames/*.png, diff/*.png
IRSA Gator catalogs          ->  committed CSV snapshots
frame stack  ->  detect sources  ->  cross-match to CatWISE2020 first,
                                     link older catalogs by proper motion
         ->  public/data/<patch>/objects.json   ->  Next.js viewer draws it
```

- **Detection** runs on the all-band, all-visit stack at a 5σ threshold.
- **Matching** uses CatWISE2020 first. AllWISE and 2MASS rows are linked by propagating the CatWISE proper motion back to their epoch. A motion claim that an older catalog contradicts is suppressed.
- **Guards** in `make_objects.py` stop the build if the unidentified fraction is too high, the grid is misaligned, or the target is missing or mislabelled.
- **Viewer** code is in `app/viewer`, `components/viewer` and `lib/`. The pure helpers in `lib/` are checked by `scripts/check-sky-objects.mjs`.

Pipeline details and tunable thresholds: [`pipeline/objects/README.md`](pipeline/objects/README.md).

## Run it locally

```bash
npm install
npm run dev            # http://localhost:3000
npm run build          # static export to out/
```

Live fetch test harness (experimental), at `/live/`. The Python backend is separate because `next dev` does not run Vercel functions:

```bash
pipeline/objects/.venv/Scripts/python.exe scripts/live_dev_server.py          # backend on http://127.0.0.1:8787/api/live/
NEXT_PUBLIC_LIVE_API_BASE=http://127.0.0.1:8787/api/live/ npm run dev         # http://localhost:3000/live/
```

Checks:

```bash
node --experimental-strip-types scripts/check-sky-objects.mjs   # viewer helpers
cd pipeline/objects && .venv/Scripts/python -m pytest tests     # pipeline tests (see pipeline/objects/README.md for setup)
```

Rebuild the object tables from the committed catalog snapshots (no network):

```bash
cd pipeline/objects
.venv/Scripts/python make_objects.py
```

## Stack

Next.js 16 (static export), React 19, TypeScript, Tailwind CSS 4, Radix UI, Recharts, canvas rendering. Python with NumPy, SciPy, Astropy, Astroquery and PyVO for the pipeline. Hosted on Vercel.

## Data and credits

- **SPHEREx** Data Release 1 Spectral Images (doi:10.26131/IRSA678) and Quick Release 3 Spectral Images (doi:10.26131/IRSA662), from the public bucket `s3://nasa-irsa-spherex`.
- **CatWISE2020** (doi:10.26131/IRSA551), **AllWISE** and **2MASS**, via IRSA Gator.
- **ESA Gaia DR3**, for astrometry of the targets and comparison stars.

Full citations and the required acknowledgements are in [`public/data/CITATION.md`](public/data/CITATION.md). A submission write-up is in [`docs/SUBMISSION.md`](docs/SUBMISSION.md).

> This publication makes use of data products from the Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which is a joint project of the Jet Propulsion Laboratory and the California Institute of Technology, and is funded by the National Aeronautics and Space Administration.

## Restore points

This repository also keeps older deployments so either can be restored.

### v0.1-live: design pass

- Branch `checkpoint/live-2026-11-13`, tag `v0.1-live`.
- The static site that was live on 13 November 2026, before long-baseline mode. Files are in `deployed/`.
- Instant rollback on Vercel, no rebuild: deployment `dpl_EFtknA9Z9YjoGjf854VyP6rZn14i`.

### v0.2-long-baseline: WISE 2010 vs SPHEREx

- Branch `feature/long-baseline`, tag `v0.2-long-baseline`.
- Adds the long-baseline blink (WISE 2010 against SPHEREx), the `/long-baseline` page and `pipeline/longbaseline`. Files are in `deployed/`.
- Instant rollback on Vercel, no rebuild: deployment `dpl_B8eYfiaQYLXFs1Su494aeud9kW7i`.
- The current production site no longer includes the long-baseline pages.

To restore, either roll production back to a deployment id above (Vercel, Deployments, Instant Rollback), or deploy the contents of `deployed/` as a static site. Do not move the tags. See `RESTORE.md`.
