# Sky objects overlay: design

Status: awaiting approval (2026-11-15). Nothing is built yet. The user chose the picks for the two
open questions (detected-only list, 1 arcsec/yr "moving" threshold); the other builder-check
questions were settled as calls listed at the end.

## Intent

SkyBlink shows SPHEREx frames of a small patch of sky as a blink. This adds a layer on top of the
blink: every object in the patch is marked, split into two kinds of category, and clickable for
details. The point is to let someone looking at a patch see at a glance what is already known
and what is not, and which things are moving.

The user said what success looks like, in their words:

- "I should be able to load a patch of sky."
- "I should be able to see all identified objects."
- "I should be able to differentiate between 2 categories of objects" (confirmed: both known vs.
  unidentified and static vs. moving).
- "I should be able to click and get more info on a selected object."

The first version works from a stored snapshot of real data. Fetching live data for any
coordinates is a later step, and the data formats here are meant to carry over to it.

## Goals

- Load any of the five existing patches (barnards-star, eps-indi-b, wise-0855, rw-aur, r-dra).
- Mark every object SPHEREx detects in the patch over the blink canvas. The object list covers
  detections only (decided by the user: "all identified objects" means everything SPHEREx sees
  that has a known counterpart, plus the unidentified ones as the other category). The marker
  sits at the detected position; the catalog position appears in the details panel.
- Two independent marks per object:
  - known vs. unidentified (color),
  - high proper motion vs. not (ring/shape).
- Show a list of all objects in the patch. Clicking a marker or a list row selects it and
  opens a details panel.
- Produce all object data offline in the Python pipeline and ship it as static JSON, so the
  site stays a static export.

## Non-goals

- Loading arbitrary coordinates. Images exist only for the five patches. Live fetching comes later.
- Classifying object types (galaxy, quasar, brown dwarf). Gaia and SIMBAD are unreachable, so
  classification would be guesswork from colors.
- Confirming discoveries.
- Fixing unrelated viewer bugs (frame desync, dead code, API route).
- Showing catalog sources SPHEREx did not detect (a possible toggle later).
- Markers in the diff view (version 1 is Blink mode only).
- The hand-patched static site in `deployed/` and the long-baseline mode. This ships only through
  the Next.js app on this branch.

## Anti-goals

- Calling anything "new" or "discovered". "Unidentified" must read as "no match in CatWISE,
  AllWISE or 2MASS", in the UI and in the data.
- Showing a marker with a type claim the data cannot support.

## Constraints

- Static export (`output: 'export'`). No server code in the viewer.
- This Next.js (16.x) has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/`
  before writing any Next code (see AGENTS.md).
- Data sources reachable as of 2026-11-15, verified: IRSA cone search (`/SCS`) for `catwise_2020`,
  `allwise_p3as_psd`, `fp_psc`; IRSA SIA for SPHEREx images; the public S3 bucket.
  Not reachable: IRSA TAP spatial queries (time out), Gaia (ESA), SIMBAD.
- Patch images are 49x49 pixels at 6.15 arcsec/pixel on a TAN grid (`target.json` `grid`),
  stored top-down (row 0 is north). Frames: six bands (D1..D6), several visits per band.
- Catalog positions are old. CatWISE2020 is at epoch MJD 57170. 2MASS is about 1999 and AllWISE
  about 2010, and neither has proper motion. Only CatWISE proper motion can be propagated to the
  SPHEREx visit dates.
- The pipeline runs on this Windows machine with Python. The only network step is the catalog fetch.
  All later steps run from stored files.

## Approaches considered

- **A. Precompute in the Python pipeline; the viewer only draws (chosen).** Detection, catalog
  fetch, cross-match and the motion flag run in Python and write one `objects.json` per patch.
  Fits the static export and the way the bundles are already built. Going live later means
  running the same code behind a server.
- B. Detect in the browser from the stored `.f32` frames. No Python step, but JavaScript source
  finding is less reliable, and the matching logic would sit in the front end, hard to reuse for
  live queries. Not chosen.
- C. Project catalog rows onto the image with no image detection. Simplest, but it cannot produce
  "unidentified", so it misses the goal. Not chosen.

## Design

### Data flow

```
IRSA SCS (CatWISE, AllWISE, 2MASS)  --fetch (network, once)-->  pipeline/objects/catalogs/<patch>_<cat>.csv
public/data/<patch>/{target.json, frames/*.f32, mask/*.png}     (already in repo)
        |                                                               |
        +---------------> detect sources ----> cross-match ----> public/data/<patch>/objects.json
                                                                        |
                                        viewer: markers on the blink canvas + list + details panel
```

### Pipeline (new `pipeline/objects/`)

1. Fetch: for each patch, cone search at the patch centre, radius covering the full grid plus a
   margin. Keep only the needed columns, save trimmed CSV snapshots in the repo so later steps
   are reproducible offline.
2. Detect: find point-like sources in the patch frames (honouring the flag masks), measure
   position and a signal-to-noise estimate. Which frame or combination of frames to detect on is
   left to the builder (see below).
3. Match: propagate CatWISE proper motions to each visit date, and match detections to the
   propagated catalog positions. Link AllWISE and 2MASS rows to the same objects by back-propagating
   the CatWISE motion to those catalogs' epochs (2MASS per-row observation date, AllWISE about
   2010), so one fast star does not appear twice or fall out of the match circle. A detection with
   a direct AllWISE or 2MASS match but no CatWISE row also counts as known. A detection with no
   counterpart is "unidentified".
4. Always include the bundle's own target (from `target.json` `catalog`) and the comparison star
   as known objects, with their existing catalog data (which may be Gaia DR3 or CatWISE), so the
   main target is never "unidentified". Their `reason` reads "bundle target" or "comparison star".
   If a patch has no comparison star, leave it out.
5. Motion flag: `moving = true` when the catalog total proper motion is at least 1000 mas/yr
   (labelled "high proper motion"). For unidentified objects, only flag moving if the image shows
   a significant shift between the first and last full visits. Be conservative.
6. Write `objects.json`.

### `objects.json` (per patch)

- `patch`, `generated`, `catalog_snapshots` (names, retrieval date, row counts), thresholds used.
- `objects[]`, each with: `id`, `kind` (`"known"` | `"unidentified"`), `moving` (bool),
  `motion_basis` (`"catalog"` | `"image"` | `"none"`), `reason` (why it is in its category: a
  catalog match, "no CatWISE/AllWISE/2MASS source within X arcsec", "bundle target" or
  "comparison star"), `name`, `catalogs` matched with their identifiers and magnitudes (W1, W2, J,
  H, K where available; Gaia DR3 allowed for the two forced objects), `pm_mas_yr`,
  `ra`/`dec` of the detection at the mean epoch, `catalog_ra`/`catalog_dec` where matched, `snr`,
  and `positions`: one pixel position (`png_x`, `png_y`, in
  the same convention as `target_px` in `target.json`) **per visit id**, so the viewer needs no
  WCS code and moving objects shift between frames.
- `manifest.json` gets an `objects` path per patch.

### Viewer

- `BlinkPlayer` takes the patch's objects and the current visit. It draws a marker for each object
  at that visit's pixel position. Known and unidentified differ by color; moving objects get a ring
  or different shape. A legend explains both. `onPixelClick` gets the click position, hit-tests the
  nearest marker within a small radius, and selects it.
- A new objects panel next to the player has: a list of all objects (default sort signal-to-noise,
  also sortable by category, name and proper motion), a toggle to hide markers, and the details
  panel for the selected object. Each row shows the object's proper motion.
- Details panel: name and IDs, category and the reason ("no CatWISE/AllWISE/2MASS source within X
  arcsec" for unidentified), proper motion, magnitudes, position, signal-to-noise, and link-outs to
  SIMBAD and IRSA pages for the position (links only, nothing fetched).
- Types for `objects.json` go in `lib/` next to the existing bundle types, loaded by
  `bundle-loader.ts` the same way as `target.json`.

### Acceptance checks

- Every patch's own target appears as a known object. Barnard's Star and WISE 0855 are flagged
  moving; the other three targets' catalog motion decides their flag.
- Counts per patch are recorded (detected, known, unidentified, moving) and the unidentified
  fraction is sanity-checked against the catalog depth. A patch where most detections are
  unidentified is a failure to investigate before shipping.
- Cross-match and the pixel-position conversion have automated tests with a small stored fixture.
- Viewer: markers line up with visible sources in the canvas (checked in a real browser), clicking
  a marker selects it, clicking empty sky deselects, the legend matches the marks, and `npm run
  lint` and a TypeScript check pass.

## Process (the user's decision)

1. An Opus agent writes the implementation plan from this design.
2. A Sonnet 5.5 agent implements it.
3. An Opus agent reviews the result against this design. Findings go back to the implementer.

## Left to the builder

- Which frames to detect on (one band's visit coadd, or a combination), the detection threshold
  and minimum separation, the edge margin.
- The exact match radius. Start near 1.5 pixels and tune with the known targets as ground truth.
- Which CatWISE quality flags to drop, and how to treat duplicate or blended catalog rows.
- Marker shapes, colors and layout, within the constraint that the two categories stay distinct
  and readable together.
- Python environment setup and test framework choices (the repo has no test framework yet).

## Decided by the user

- The object list covers detections only.
- "Moving" threshold of 1000 mas/yr from catalog proper motion, labelled "high proper motion",
  with each object's proper motion shown in the list and details panel.

## My calls (not discussed with the user)

- Both pairs of categories are shown as independent marks, not four combined classes.
- SPHEREx visits are months apart and a pixel is 6.15 arcsec, so image-measured motion only shows
  for the fastest objects. That is why the motion flag is mostly catalog-based.
- Catalogs are matched with CatWISE as the primary because it is the only one with proper motion;
  older catalogs are linked to it by back-propagating its motion.
- Marker position is the detected position; the catalog position is shown in the details.
- The list sorts by signal-to-noise by default, since unidentified objects have no catalog magnitudes.
- The bundle target and comparison star are always known objects, with a "bundle target" or
  "comparison star" reason.
- Scope is the Next.js app on this branch, Blink mode only.
- Trimmed catalog CSVs are committed for reproducibility.
- Positions are stored per visit so the viewer needs no coordinate conversion.
