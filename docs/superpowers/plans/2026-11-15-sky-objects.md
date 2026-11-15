# Sky Objects Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mark every object SPHEREx detects in each of the five patches on the Blink canvas, as known or unidentified (color) and high proper motion or not (ring), with a sortable list and a details panel, from offline-built `objects.json` files.

**Architecture:** A new Python pipeline under `pipeline/objects/` fetches trimmed IRSA catalog snapshots once (the only network step), then offline detects sources in the stored `.f32` frames, cross-matches them against CatWISE2020 (AllWISE and 2MASS linked by back-propagating CatWISE motion), and writes `public/data/<patch>/objects.json` with one pixel position per visit. The Next.js viewer loads that file next to `target.json`, draws markers in `BlinkPlayer` using pure geometry and hit-test functions from `lib/`, and shows an objects panel and details panel.

**Tech Stack:** Python 3.12 venv (numpy, scipy, Pillow, requests, astropy, pytest); Next.js 16.4 static export, React 19, TypeScript, Tailwind 4; Node 22 `--experimental-strip-types` for a `node:assert` check script (no test framework).

**Spec:** `docs/superpowers/specs/2026-11-15-sky-objects-design.md`

## Global Constraints

- Static export (`output: 'export'`). No server code in the viewer. Link-outs are links only; nothing is fetched from SIMBAD or IRSA by the viewer.
- This Next.js (16.x) has breaking changes. Before writing any Next/React code, read `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` and `node_modules/next/dist/docs/01-app/02-guides/static-exports.md`.
- Never call anything "new" or "discovered". "Unidentified" must read as "no match in CatWISE, AllWISE or 2MASS", in the UI and in the data.
- Markers in Blink mode only. No markers in the Diff view.
- "Moving" = catalog total proper motion >= 1000 mas/yr, labelled "high proper motion"; each object's proper motion is shown in the list and details panel.
- The object list covers detections only, plus the forced bundle target and comparison star.
- Only `pipeline/objects/fetch_catalogs.py` touches the network. Every other step runs offline from committed files. Gaia, SIMBAD and IRSA TAP are unreachable: do not call them. Never use `curl -k` or disable TLS verification.
- Do NOT modify: `deployed/`, `api/`, `app/api/`, `pipeline/longbaseline/`, `lib/targets.ts`, `.gitignore`, `app/globals.css`, `package.json`, `package-lock.json`, `postcss.config.mjs`, `AGENTS.md`, `next-env.d.ts`. Do not add npm or Python packages beyond those named here.
- Commit only your task's files, by explicit path. Never `git add -A` / `git add .`.
- Shell is Git Bash on Windows. Python commands use the venv interpreter `pipeline/objects/.venv/Scripts/python` (call it `$PY` below; run pytest from `pipeline/objects/`).
- Lint baseline is not clean (39 errors repo-wide, 4 of them pre-existing in `app/viewer/page.tsx`). Rule: every new file has 0 eslint problems; `components/viewer/BlinkPlayer.tsx` and `lib/bundle-loader.ts` stay at 0; `app/viewer/page.tsx` keeps exactly its 4 pre-existing errors (no-explicit-any x2, set-state-in-effect, no-unescaped-entities) and gains none. `npx tsc --noEmit` exits 0.
- React lint rule `react-hooks/set-state-in-effect` is active: never call setState synchronously inside `useEffect`; reset state in event handlers instead.

## Review Focus

1. Saturated targets (Barnard's Star, R Dra: cores masked in the frames) -> the target still appears as a known object with a marker at its `target_px` for each visit, `detected: false`, `snr: null`, and the details panel says "not measured (core masked)" instead of a number: `undetected_note` is `"core masked"` when the object's pixel is masked in >= 50% of the detection frames, otherwise `"no detection above the S/N threshold in the frame stack"` (WISE 0855, whose target is also refused a detection that a catalogued static star explains). Detected objects have `undetected_note: null`. Pinned by Task 3 `test_forced_target_without_detection`, `test_undetected_note_*` and Task 7 copy.
2. Fast movers that CatWISE split into several rows (eps Indi B, WISE 0855) -> those rows are absorbed by the bundle target and never become extra "known" objects or steal a neighbour's match. Pinned by Task 3 `test_target_split_rows_absorbed`.
3. Canvas shown smaller than 294 px (narrow window, `maxWidth: 100%`) -> clicking a marker still selects that marker. Pinned by Task 6 check `clientToCanvas half-size` and Task 8 browser step at 375 px width.
4. `objects.json` missing, 404, or a manifest entry without `objects` -> the blink still loads and the panel reads "No object data for this patch". Pinned by Task 5 loader behaviour and Task 8 browser step with the request blocked.
5. Switching patch, band or mode while an object is selected -> selection cleared on patch switch, kept on band switch, markers absent in Diff; a visit missing from `positions` draws no marker and does not crash. Pinned by Task 6 check `markerGeometry missing visit` and Task 8 browser steps.

## Verified facts the tasks rely on

- `.f32` frames: raw little-endian float32 (`'<f4'`), 2401 values = 49x49, rows top-down (row 0 = north), unit MJy/sr (local-median-subtracted), NaN where no data. Read with `np.fromfile(p, '<f4').reshape(49, 49)`. Written by `save_f32` in `pipeline/longbaseline/stage3.py` (`np.flipud` of the FITS-orientation array).
- Masks `mask/<band>/<visit>.png`: 8-bit L, 0 = good, 255 = bad (NaN, or >= 50 % of co-added inputs flagged/saturated). Barnard's Star has 40 px and R Dra 106 px masked in >= 50 % of frames (saturated cores).
- Pixel convention: `png_x`, `png_y` are 0-based pixel-centre coordinates (pixel i spans i-0.5..i+0.5). `png_x = x`, `png_y = 48 - y` with FITS 0-based `(x, y)` from astropy `wcs_world2pix(ra, dec, 0)` on the grid WCS (TAN, CRPIX 25,25, CDELT1 = -6.15/3600, CDELT2 = +6.15/3600, CRVAL = mean-epoch target position, so the target sits at png (24, 24) at `mean_epoch.mjd`). On a 294 px canvas (scale 6) pixel centre i is at canvas `(i + 0.5) * 6`. (The existing crosshair uses `png_x * scale`, half a pixel off; that is an unrelated bug, leave it.)
- Visits differ by band (e.g. barnards-star D2 has v1,v3,v5,v6). `positions` must cover every id in `target.visits`.
- `target.json` `catalog` is Gaia DR3 for four patches and CatWISE2020 for wise-0855; `comparison_star` is null for wise-0855. Targets' catalog total PM: barnards-star 10393, eps-indi-b 4684, wise-0855 8088, rw-aur 27.5, r-dra 21.5 mas/yr.
- `public/data/manifest.json` round-trips byte-exactly with `json.dumps(d, indent=1)` and no trailing newline.
- IRSA on 2026-11-15: `/SCS` returned HTTP 502 on every attempt during planning. Gator (`https://irsa.ipac.caltech.edu/cgi-bin/Gator/nph-query`) works (1.5 to 8 s) and returns the same rows (631 CatWISE rows at 216 arcsec around Barnard's Star, matching the SCS count reported earlier). Gator returns an IPAC table with a units row; on bad input it returns HTTP 200 with a body like `[struct stat="ERROR", msg=...]`. The fetch therefore uses Gator.
- CatWISE2020 columns (verified): `source_name, ra, dec` (stationary fit, near `meanobsmjd`), `ra_pm, dec_pm` (position at MJD 57170 from the motion fit; use these), `pmra, pmdec, sigpmra, sigpmdec` in **arcsec/yr** (convert x1000 to mas/yr; `pmra` already includes cos(dec): checked against the `ra`/`ra_pm` offset of a field row at dec -56.8), `w1mpro, w2mpro, w1snr, w2snr, nb, na, cc_flags, ab_flags, pmcode, meanobsmjd`. CatWISE has no `ext_flg`.
- AllWISE (`allwise_p3as_psd`): `designation, ra, dec, w1mpro, w2mpro, w3mpro, w1snr, w2snr, cc_flags, ext_flg, ph_qual, w1mjdmean` (per-row epoch, about MJD 55355; use 55400 if null).
- 2MASS (`fp_psc`): `designation, ra, dec, j_m, h_m, k_m, ph_qual, cc_flg, jdate` (Julian date; MJD = jdate - 2400000.5).
- Feasibility run during planning (approach of Task 2 and 3, threshold 5, radius 1.5 px): detections barnards-star 47, eps-indi-b 31, wise-0855 45, rw-aur 62, r-dra 5; CatWISE median match separation 0.23 px (barnards-star), 0.13 px (rw-aur); unidentified 6/47 and 7/62. CatWISE density gives about 1 chance source per 1.5 px circle, so the match picks the brightest candidate.

## `objects.json` schema (shared by Tasks 3, 4, 5)

TypeScript (exact, goes in `lib/sky-objects.ts`):

```ts
export type ObjectKind = 'known' | 'unidentified'
export type MotionBasis = 'catalog' | 'image' | 'none'
export type CatalogName = 'CatWISE2020' | 'AllWISE' | '2MASS' | 'Gaia DR3'
export type MagBand = 'W1' | 'W2' | 'W3' | 'J' | 'H' | 'K' | 'G'
export type ForcedReason = 'bundle target' | 'comparison star'
export interface PixelPos { png_x: number; png_y: number }
export interface CatalogMatch { catalog: CatalogName; id: string; sep_arcsec: number | null; mags: Partial<Record<MagBand, number>> }
export interface ProperMotion { pmra: number | null; pmdec: number | null; total: number; total_err: number | null } // mas/yr, pmra includes cos(dec)
export interface SkyObject {
  id: string                    // "<patch>-NNN", NNN 1-based in output order
  kind: ObjectKind
  moving: boolean
  motion_basis: MotionBasis
  reason: string
  name: string
  catalogs: CatalogMatch[]
  pm_mas_yr: ProperMotion | null
  ra: number; dec: number       // detection (or forced catalog) position at mean epoch, deg
  catalog_ra: number | null; catalog_dec: number | null  // primary catalog position at mean epoch (CatWISE/forced propagated; AllWISE/2MASS as listed)
  snr: number | null            // null when not detected
  detected: boolean
  forced: ForcedReason | null
  image_shift_px: number | null // measured first->last full visit shift, unidentified objects only
  positions: Record<string, PixelPos> // key = every visit id in target.json visits
  undetected_note: string | null // forced objects with detected=false only: "core masked" or "no detection above the S/N threshold in the frame stack"
}
export interface CatalogSnapshot { catalog: CatalogName; table: string; file: string; retrieved: string; rows: number; radius_arcsec: number; service: string }
export interface ObjectThresholds {
  detect_snr: number; min_sep_px: number; edge_margin_px: number; min_frames: number; halo_dilate_px: number
  match_radius_px: number; match_radius_arcsec: number; forced_radius_px: number
  link_radius_arcsec: number; link_radius_max_arcsec: number
  moving_pm_mas_yr: number; moving_pm_min_significance: number
  image_shift_min_px: number; image_shift_min_snr: number; target_absorb_radius_arcsec: number
}
export interface ObjectCounts { detected: number; known: number; unidentified: number; moving: number; forced_undetected: number }
export interface SkyObjectsFile {
  version: 1; patch: string; generated: string; mean_epoch_mjd: number
  detection_frames: string[]    // "D2/v1" labels
  catalog_snapshots: CatalogSnapshot[]; thresholds: ObjectThresholds; counts: ObjectCounts; objects: SkyObject[]
}
```

Python mirrors it with dataclasses in `pipeline/objects/schema.py` (same field names, `str | None` etc.). Rounding on write: png 3 dp, ra/dec 7 dp, snr 1 dp, pm 1 dp, sep 2 dp, mags 3 dp, image_shift 2 dp. Output order: detected objects by snr descending, then undetected forced objects.

Copy (exact strings):
- reason CatWISE: `f"CatWISE2020 match within {sep:.1f} arcsec"`; AllWISE-only: `f"AllWISE match within {sep:.1f} arcsec (no CatWISE2020 row)"`; 2MASS-only: `f"2MASS match within {sep:.1f} arcsec (no CatWISE2020 or AllWISE row)"`; unidentified: `f"no CatWISE/AllWISE/2MASS source within {match_radius_arcsec:.1f} arcsec"`; forced: `"bundle target"` / `"comparison star"`.
- names: `"CWISE " + source_name`, `"WISEA " + designation`, `"2MASS J" + designation`, target = `target.json` `name`, comparison = `"Gaia DR3 " + gaia_dr3_source_id`, unidentified = `f"Unidentified #{n:03d}"` (n counts unidentified objects in output order).

---

### Task 1: Python environment, catalog fetch and snapshot loaders

**Files:**
- Create: `pipeline/objects/requirements.txt`, `pipeline/objects/.gitignore`, `pipeline/objects/pytest.ini`, `pipeline/objects/config.py`, `pipeline/objects/fetch_catalogs.py`, `pipeline/objects/catalogs.py`
- Create: `pipeline/objects/tests/test_fetch.py`, `pipeline/objects/tests/test_catalogs.py`, `pipeline/objects/tests/fixtures/gator_catwise_small.tbl`
- Create (generated, committed): `pipeline/objects/catalogs/<patch>_{catwise,allwise,2mass}.csv` (15 files), `pipeline/objects/catalogs/snapshots.json`

**Interfaces:**
- Produces (`config.py`):
  - `REPO_ROOT: Path` (= `Path(__file__).resolve().parents[2]`), `DATA_DIR = REPO_ROOT/"public"/"data"`, `OBJ_DIR = Path(__file__).resolve().parent`, `CATALOG_DIR = OBJ_DIR/"catalogs"`, `REPORT_DIR = OBJ_DIR/"reports"`
  - `PATCHES = ("barnards-star", "eps-indi-b", "wise-0855", "rw-aur", "r-dra")`, `NPIX = 49`, `PIXEL_SCALE_ARCSEC = 6.15`, `CONE_RADIUS_ARCSEC = 300.0`, `CATWISE_EPOCH_MJD = 57170.0`, `ALLWISE_DEFAULT_EPOCH_MJD = 55400.0`, `GATOR_URL = "https://irsa.ipac.caltech.edu/cgi-bin/Gator/nph-query"`
  - `CATALOGS: dict[str, CatalogSpec]` keyed `"catwise" | "allwise" | "2mass"`; `@dataclass(frozen=True) class CatalogSpec: label: str; table: str; columns: tuple[str, ...]` with labels `CatWISE2020`/`AllWISE`/`2MASS`, tables `catwise_2020`/`allwise_p3as_psd`/`fp_psc`, columns exactly as in "Verified facts" (CatWISE: `source_name, ra, dec, ra_pm, dec_pm, pmra, pmdec, sigpmra, sigpmdec, w1mpro, w2mpro, w1snr, w2snr, nb, na, cc_flags, ab_flags, pmcode, meanobsmjd`).
  - `THRESHOLDS: dict[str, float]` with the starting values: `detect_snr=5.0, min_sep_px=2.0, edge_margin_px=2, min_frames=3, halo_dilate_px=1, match_radius_px=1.5, match_radius_arcsec=9.225, forced_radius_px=2.0, link_radius_arcsec=3.0, link_radius_max_arcsec=6.0, moving_pm_mas_yr=1000.0, moving_pm_min_significance=5.0, image_shift_min_px=1.0, image_shift_min_snr=10.0, target_absorb_radius_arcsec=20.0`
  - `GUARD_MAX_UNIDENTIFIED_FRACTION = 0.5`, `GUARD_MAX_MEDIAN_SEP_PX = 0.6`, `WARN_UNIDENTIFIED_FRACTION = 0.25`
- Produces (`fetch_catalogs.py`): `class FetchError(RuntimeError)`; `build_query(table: str, ra: float, dec: float, radius_arcsec: float, columns: Sequence[str]) -> dict[str, str]`; `parse_gator_ipac(text: str, required: Sequence[str]) -> tuple[list[dict[str, str]], dict[str, str]]` (rows with `''` for null, units by column); `fetch_all(patches=PATCHES, out_dir=CATALOG_DIR, session: requests.Session | None = None, today: str | None = None) -> dict`; `main() -> int`.
- Produces (`catalogs.py`): frozen dataclasses
  - `CatwiseRow(name: str, ra: float, dec: float, pmra: float, pmdec: float, sigpm: float, w1: float | None, w2: float | None, cc_flags: str, ab_flags: str)` — `ra/dec` are `ra_pm/dec_pm` at MJD 57170; pm fields mas/yr; `sigpm = hypot(sigpmra, sigpmdec)` in mas/yr.
  - `AllwiseRow(name: str, ra: float, dec: float, epoch_mjd: float, w1: float | None, w2: float | None, w3: float | None)`
  - `TmassRow(name: str, ra: float, dec: float, epoch_mjd: float, j: float | None, h: float | None, k: float | None)`
  - `load_catwise(path: Path) -> list[CatwiseRow]`, `load_allwise(path: Path) -> list[AllwiseRow]`, `load_tmass(path: Path) -> list[TmassRow]`, `load_snapshots(path: Path = CATALOG_DIR/"snapshots.json") -> dict`.

- [ ] **Step 1: Environment**

`requirements.txt`: `numpy>=1.26`, `scipy>=1.11`, `Pillow>=10.0`, `requests>=2.31`, `astropy>=6.0`, `pytest>=8.0`. `.gitignore`: `.venv/`. `pytest.ini`: `[pytest]` / `pythonpath = .` / `testpaths = tests`.

Run: `py -3.12 -m venv pipeline/objects/.venv && pipeline/objects/.venv/Scripts/python -m pip install -r pipeline/objects/requirements.txt`
Expected: installs succeed; `$PY -c "import astropy, scipy; print(astropy.__version__)"` prints a version. Use only `astropy.wcs` and `astropy.io.ascii` (not `astropy.coordinates`/`Time`, which may try to download IERS tables).

- [ ] **Step 2: Save the fixture** — fetch a real 36 arcsec Gator CatWISE response once and save it verbatim as `tests/fixtures/gator_catwise_small.tbl`:

`curl -s "https://irsa.ipac.caltech.edu/cgi-bin/Gator/nph-query?catalog=catwise_2020&spatial=cone&objstr=269.4463742+4.7686831&radius=36&radunits=arcsec&outfmt=1&selcols=<the CatWISE columns joined by commas>" -o pipeline/objects/tests/fixtures/gator_catwise_small.tbl` (expect `\RowsRetrieved` about 6).

- [ ] **Step 3: Write the failing tests**

```python
# tests/test_fetch.py
def test_parse_fixture_rows_and_units():
    rows, units = parse_gator_ipac(FIXTURE.read_text(), CATALOGS["catwise"].columns)
    assert len(rows) == int(re.search(r"RowsRetrieved\s*=\s*(\d+)", FIXTURE.read_text()).group(1))
    assert units["pmra"] == "arcsec/yr" and units["ra_pm"] == "deg"
    assert all(set(CATALOGS["catwise"].columns) <= set(r) for r in rows)

def test_error_body_raises():
    with pytest.raises(FetchError):
        parse_gator_ipac('[struct stat="ERROR", msg="904: invalid identifier"]', ["ra"])

def test_html_502_body_raises():
    with pytest.raises(FetchError):
        parse_gator_ipac("<!DOCTYPE HTML><title>502 Proxy Error</title>", ["ra"])

def test_missing_column_raises():
    with pytest.raises(FetchError):
        parse_gator_ipac(FIXTURE.read_text(), ["ra", "no_such_col"])

def test_network_failure_writes_nothing(tmp_path, monkeypatch):
    out = tmp_path / "catalogs"; out.mkdir(); (out / "keep.txt").write_text("x")
    session = FailingSession(fail_after=7)  # first 7 GETs return the fixture, then raise requests.ConnectionError
    monkeypatch.setattr("time.sleep", lambda s: None)
    with pytest.raises(FetchError):
        fetch_all(out_dir=out, session=session)
    assert sorted(p.name for p in out.iterdir()) == ["keep.txt"]

def test_query_params():
    q = build_query("catwise_2020", 269.4463742, 4.7686831, 300.0, ["ra", "dec"])
    assert q["spatial"] == "cone" and q["radunits"] == "arcsec" and q["outfmt"] == "1"
    assert q["objstr"] == "269.4463742 4.7686831" and q["selcols"] == "ra,dec" and q["radius"] == "300.0"
```

```python
# tests/test_catalogs.py  (write a 4-row CSV in tmp_path with the CatWISE columns)
def test_catwise_units_and_filter(tmp_path):
    # row A good: pmra=0.89940 arcsec/yr -> 899.4 mas/yr; ra_pm used, not ra
    # row B cc_flags "D000" -> dropped; row C w1snr=3,w2snr=2 -> dropped; row D cc_flags "hh00" (lowercase) -> kept
    rows = load_catwise(path)
    assert [r.name for r in rows] == ["A", "D"]
    assert rows[0].pmra == pytest.approx(899.4) and rows[0].ra == pytest.approx(RA_PM_A)

def test_tmass_epoch_from_jdate(tmp_path):
    assert load_tmass(path)[0].epoch_mjd == pytest.approx(2451692.9285 - 2400000.5)

def test_allwise_epoch_default(tmp_path):  # w1mjdmean empty -> 55400.0
    assert load_allwise(path)[0].epoch_mjd == 55400.0
```

- [ ] **Step 4: Run** `cd pipeline/objects && .venv/Scripts/python -m pytest -q` — Expected: FAIL (modules missing).

- [ ] **Step 5: Implement `config.py`, `fetch_catalogs.py`, `catalogs.py`** per Interfaces.
  - `parse_gator_ipac`: raise `FetchError` unless the text starts with `\` and contains `\RowsRetrieved`; parse with `astropy.io.ascii.read(text, format="ipac")`; check row count equals `RowsRetrieved` and all `required` columns exist; masked values become `''`.
  - `fetch_all`: patch centre = `grid.CRVAL1/CRVAL2` from `DATA_DIR/<patch>/target.json`; GET `GATOR_URL` with `timeout=60`, `verify` left at default (True); up to 3 attempts per table with sleeps 5 s then 15 s on network error or non-200 or `FetchError`; assert `units["pmra"] == "arcsec/yr"` for CatWISE; zero rows for any table is a `FetchError`. Write all 15 CSVs and `snapshots.json` into a temp dir `out_dir.parent/".catalogs_tmp"`; only after all succeed, move them into `out_dir` (replacing same-named files); on any failure delete the temp dir and re-raise. CSVs keep IRSA column names and units verbatim (header = `spec.columns`), written with `csv` module.
  - `snapshots.json`: `{"service": GATOR_URL, "retrieved": "YYYY-MM-DD", "radius_arcsec": 300.0, "files": [{"patch", "catalog" (label), "table", "file", "rows", "units": {col: unit}}]}`.
  - `main()`: print one line per table (`patch catalog rows seconds`), return 1 with the error text on `FetchError`.
  - CatWISE quality filter (in `load_catwise`): drop if `ra_pm`, `dec_pm`, `pmra` or `pmdec` empty; drop if both `w1mpro` and `w2mpro` empty; drop if `max(w1snr, w2snr) < 5`; drop if `cc_flags[0]` or `cc_flags[1]` is one of `D P H O` (uppercase = confirmed artifact; `null`/empty passes). AllWISE: same uppercase `cc_flags` rule. 2MASS: keep all rows with ra/dec.

- [ ] **Step 6: Run tests** — Expected: all PASS.

- [ ] **Step 7: Fetch the real snapshots**

Run: `cd pipeline/objects && .venv/Scripts/python fetch_catalogs.py`
Expected: exit 0, 15 lines; CatWISE rows per patch in the hundreds to low thousands (barnards-star about 1322, rw-aur about 1068 at 300 arcsec). If IRSA fails, the command exits 1 and `catalogs/` is unchanged; retry later, do not hand-edit snapshots.

- [ ] **Step 8: Commit**

```bash
git add pipeline/objects/requirements.txt pipeline/objects/.gitignore pipeline/objects/pytest.ini pipeline/objects/config.py pipeline/objects/fetch_catalogs.py pipeline/objects/catalogs.py pipeline/objects/tests/test_fetch.py pipeline/objects/tests/test_catalogs.py pipeline/objects/tests/fixtures/gator_catwise_small.tbl pipeline/objects/catalogs/
git commit -m "feat(objects): python env, IRSA catalog fetch and trimmed snapshots"
```

---

### Task 2: Source detection from `.f32` frames

**Files:**
- Create: `pipeline/objects/detect.py`, `pipeline/objects/tests/test_detect.py`

**Interfaces:**
- Consumes: `config.DATA_DIR`, `config.NPIX`, `config.THRESHOLDS`.
- Produces:
  - `@dataclass(frozen=True) class Frame: band: str; visit: str; data: np.ndarray` (49x49 float32, row 0 north, NaN on masked/non-finite)
  - `@dataclass(frozen=True) class Detection: png_x: float; png_y: float; snr: float`
  - `load_frames(patch_dir: Path, target: dict) -> list[Frame]` (every `paths[band][visit]` entry except the `"diff"` key; raises `ValueError` if a `.f32` does not hold 2401 values)
  - `normalize_frame(data: np.ndarray) -> np.ndarray` (z-map; all-NaN if < 50 finite pixels or sigma 0)
  - `detection_map(frames: Sequence[Frame], min_frames: int) -> np.ndarray`
  - `bad_fraction(frames: Sequence[Frame]) -> np.ndarray` (fraction of frames NaN per pixel)
  - `find_sources(snr_map: np.ndarray, badfrac: np.ndarray, *, threshold: float, min_sep_px: float, edge_margin_px: int, halo_dilate_px: int) -> list[Detection]` (sorted snr desc)
  - `detect_patch(patch_dir: Path, target: dict, thresholds: Mapping[str, float]) -> tuple[list[Detection], list[str], list[Frame]]` (detections, frame labels `"D2/v1"`, frames)
  - `visit_centroid(frames: Sequence[Frame], visit: str, x0: float, y0: float, *, search_px: float = 2.0) -> Detection | None`

Algorithm (pinned; the design leaves frame choice to the builder — the choice is: all bands and all visits combined):
- `normalize_frame`: on finite pixels, median `m` and `sigma = 1.4826 * MAD`, 3 iterations of clipping at `|v - m| < 3 sigma`; return `(data - m) / sigma`.
- `detection_map`: `S = nansum(z) / sqrt(n)` over frames where `n` = finite count per pixel; `S = NaN` where `n < min_frames`. No smoothing (PSF FWHM is 1.2 px).
- `find_sources`: peak if finite, `S >= threshold`, and `S` equals the maximum of `S` (NaN -> -inf) over a disk footprint of radius `min_sep_px`; peak pixel index within `[edge_margin_px, 48 - edge_margin_px]` on both axes; discard peaks inside `binary_dilation(badfrac >= 0.5, iterations=halo_dilate_px)`; position = peak + weighted centroid offset over its 3x3 box with weights `clip(S, 0)` (NaN -> 0); `snr = S[peak]`.
- `visit_centroid`: `detection_map` of that visit's frames with `min_frames=1`, highest finite pixel within `search_px` of `(x0, y0)`, same 3x3 centroid; None if no finite pixel.

- [ ] **Step 1: Write the failing tests** (synthetic helper `make_frames(sources, n=12, seed=42, mask=None)`: Gaussian PSF sigma 0.6 px, per-frame noise sigma 1, `sources = [(x, y, amp)]`)

```python
def test_finds_isolated_sources():
    srcs = [(10.3, 12.7, 3.0), (30.0, 35.5, 3.0), (40.6, 8.2, 3.0)]
    dets = run(make_frames(srcs))
    assert len(dets) == 3
    for x, y, _ in srcs:
        assert min(hypot(d.png_x - x, d.png_y - y) for d in dets) < 0.25

def test_pure_noise_gives_nothing():
    assert run(make_frames([])) == []

def test_edge_source_excluded():
    assert run(make_frames([(1.0, 20.0, 5.0)])) == []

def test_masked_core_and_halo_suppressed():
    frames = make_frames([(24.0, 24.0, 50.0)], mask=box(23, 25, 23, 25))  # 3x3 NaN in every frame
    assert all(hypot(d.png_x - 24, d.png_y - 24) > 2.5 for d in run(frames))

def test_close_pair_merges():
    assert len(run(make_frames([(20.0, 20.0, 4.0), (21.0, 20.0, 4.0)]))) == 1

def test_visit_centroid_tracks_shift():
    fr = make_frames_two_visits(pos_v1=(20.0, 20.0), pos_v2=(21.5, 20.0), amp=4.0)
    assert visit_centroid(fr, "v2", 20.0, 20.0).png_x == pytest.approx(21.5, abs=0.25)

def test_real_frame_orientation():  # barnards-star D2/v1: brightest pixel is the comparison star (row 8, col 25)
    a = load_frames(DATA_DIR / "barnards-star", target)[...]  # pick D2/v1
    assert np.unravel_index(np.nanargmax(a.data), a.data.shape) == (8, 25)

def test_real_patch_finds_comparison_star():
    dets, labels, _ = detect_patch(DATA_DIR / "barnards-star", target, THRESHOLDS)
    assert min(hypot(d.png_x - 25.46, d.png_y - 7.839) for d in dets) < 1.0
    assert "D2/v1" in labels and 20 <= len(dets) <= 80
```
(`run(frames)` = `find_sources(detection_map(frames, 3), bad_fraction(frames), threshold=5.0, min_sep_px=2.0, edge_margin_px=2, halo_dilate_px=1)`.)

- [ ] **Step 2: Run** `.venv/Scripts/python -m pytest tests/test_detect.py -q` — Expected: FAIL (import error).
- [ ] **Step 3: Implement `detect.py`** per Interfaces and the pinned algorithm (scipy `maximum_filter(footprint=...)`, `binary_dilation`).
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `git add pipeline/objects/detect.py pipeline/objects/tests/test_detect.py && git commit -m "feat(objects): source detection on stored frames"`

---

### Task 3: Geometry, cross-match and motion flags

**Files:**
- Create: `pipeline/objects/geometry.py`, `pipeline/objects/schema.py`, `pipeline/objects/match.py`
- Create: `pipeline/objects/tests/test_geometry.py`, `pipeline/objects/tests/test_match.py`, `pipeline/objects/tests/fixtures/make_fixtures.py`, and its committed outputs `pipeline/objects/tests/fixtures/mini_target.json`, `mini_catwise.csv`, `mini_allwise.csv`, `mini_2mass.csv`

**Interfaces:**
- Consumes: Task 1 `CatwiseRow`, `AllwiseRow`, `TmassRow`, loaders, `THRESHOLDS`, `CATWISE_EPOCH_MJD`, `PIXEL_SCALE_ARCSEC`; Task 2 `Detection`, `Frame`, `visit_centroid`.
- Produces (`geometry.py`): `MJD_PER_YEAR = 365.25`; `grid_wcs(grid: Mapping) -> astropy.wcs.WCS`; `radec_to_png(grid, ra, dec) -> tuple[ArrayLike, ArrayLike]`; `png_to_radec(grid, png_x, png_y) -> tuple[ArrayLike, ArrayLike]`; `propagate(ra, dec, pmra_mas_yr, pmdec_mas_yr, from_mjd, to_mjd) -> tuple[ArrayLike, ArrayLike]` (linear: `dec += pmdec*dt/3.6e6`, `ra += pmra*dt/3.6e6/cos(dec)`, `dt` years); `sep_arcsec(ra1, dec1, ra2, dec2) -> ArrayLike` (haversine).
- Produces (`schema.py`): dataclasses `PixelPos`, `CatalogMatch`, `ProperMotion`, `SkyObject`, `CatalogSnapshot`, `ObjectCounts`, `ObjectsFile` with the field names and types of the shared schema (`ObjectsFile.version: int = 1`, `thresholds: dict[str, float]`).
- Produces (`match.py`):
  - `@dataclass class MatchStats: median_sep_px: float | None; n_catwise_in_grid: int; chance_per_circle: float; bright_recovery: float | None; n_absorbed: int; shift_floor_px: float; comparison_offset_px: float | None; target_detected: bool`
  - `absorb_target_rows(rows: list[CatwiseRow], target: dict, radius_arcsec: float) -> tuple[list[CatwiseRow], list[CatwiseRow]]` (kept, absorbed): absorbed = rows within `radius_arcsec` of the bundle target's catalog position propagated to MJD 57170.
  - `catalog_moving(total: float, total_err: float | None, th: Mapping) -> bool`: `total >= moving_pm_mas_yr and (total_err is None or total >= moving_pm_min_significance * total_err)`.
  - `link_older(cw: CatwiseRow, rows: Sequence[AllwiseRow | TmassRow], th: Mapping, used: set[int]) -> tuple[int | None, float | None]`: for each unused row, propagate `cw` from 57170 to `row.epoch_mjd`; radius = `min(link_radius_arcsec + 3 * cw.sigpm * abs(dt_yr) / 1000, link_radius_max_arcsec)`; nearest within radius.
  - `build_objects(patch: str, target: dict, detections: list[Detection], frames: list[Frame], catwise: list[CatwiseRow], allwise: list[AllwiseRow], tmass: list[TmassRow], th: Mapping[str, float]) -> tuple[list[SkyObject], MatchStats]` (ids/names assigned, output order per schema).

Matching rules (pinned; run in this order, each detection claimed at most once, each catalog row used at most once):
1. Absorb target split rows (`target_absorb_radius_arcsec` = 20).
2. Bundle target: mean-epoch position png (24, 24). Claims the nearest detection within `forced_radius_px` (2.0). `positions[v] = target_px[v] + offset`, offset = detection - (24, 24) if detected else (0, 0). `catalogs = [CatalogMatch(target.catalog.catalog, source_id, None, {G} or {W1, W2})]`; `pm = ProperMotion(pmra, pmdec, hypot, hypot(pmra_err, pmdec_err) or None)`; `moving = catalog_moving(...)`; `motion_basis="catalog"`; `forced="bundle target"`; `ra/dec` = detection via `png_to_radec`, else `mean_epoch.ra_deg/dec_deg`; `catalog_ra/dec = mean_epoch.ra_deg/dec_deg`.
3. Comparison star (skip if null): position `(png_x, png_y)`, claims nearest detection within 2.0 px, constant positions (offset applied as for the target), `catalogs = [Gaia DR3 id with {G}]` plus a CatWISE row (and its linked AllWISE/2MASS) if one lies within `match_radius_px` of the detection; `pm = ProperMotion(None, None, pm_total_mas_yr, None)`, `moving` by `catalog_moving`, `forced="comparison star"`.
4. CatWISE: propagate kept rows to `mean_epoch.mjd`, convert to png. For remaining detections in snr order: candidates within `match_radius_px`; pick brightest W1 (W2 if W1 null; rows with neither last), tie -> nearest. Link AllWISE then 2MASS with `link_older`. Positions: `det + (cat_png(visit.mjd_mean) - cat_png(mean_epoch))`. `motion_basis="catalog"`, `moving = catalog_moving(hypot(pmra, pmdec), cw.sigpm)`.
5. AllWISE direct: unused AllWISE rows within `match_radius_arcsec` of the detection ra/dec (no motion) -> known, pm null, `moving=False`, `motion_basis="none"`, constant positions. Then 2MASS the same way.
6. Remaining detections: unidentified. Image motion test between the first and last full visit (`target.full_visits`): `visit_centroid` at the detection in both; `shift_floor_px` = median shift measured the same way for CatWISE-matched non-moving objects with snr >= `image_shift_min_snr` (0.5 if fewer than 3); `moving = shift >= max(image_shift_min_px, 3 * floor)` and both visit snr >= `image_shift_min_snr`. Moving: `motion_basis="image"`, positions linearly interpolated/extrapolated in `mjd_mean` between the two centroids; else constant positions, `motion_basis="none"`. `image_shift_px` = shift when measurable.
7. Stats: `median_sep_px` over step-4 matches; `n_catwise_in_grid` = kept rows with mean-epoch png inside [-0.5, 48.5]; `chance_per_circle = n_catwise_in_grid / 49**2 * pi * match_radius_px**2`; `bright_recovery` = fraction of in-grid kept rows with W1 < 13.0 (and at least 2 px from edge) that were matched (report-only); `comparison_offset_px` = detection-to-catalog distance for the comparison star.

Fixture (`make_fixtures.py`, deterministic, uses `geometry`; commit both script and outputs). Grid as the real ones but `CRVAL1=150.0, CRVAL2=2.0`; `mean_epoch.mjd = 61000.0`; visits `v1` (mjd_mean 60800, full) and `v2` (61200, full) with `target_px` computed by propagating the target catalog; target catalog Gaia DR3 `pmra=3000, pmdec=0, ref_epoch_mjd=57388.5`, errors 0.5; comparison star at png (8.0, 40.0), `pm_total_mas_yr=2.0`. Sources, given by mean-epoch png position:
- `C1` CatWISE static at (10, 10), W1 12.0.
- `C2` CatWISE `pmra=0, pmdec=+2000` mas/yr, sigpmra=sigpmdec=35 (stored in arcsec/yr in the CSV), at (30, 15) at mean epoch; its AllWISE row placed at its own position at MJD 55400 and its 2MASS row at MJD 51400 (`jdate = 2451400.5`), both computed by propagation (about 5 px and 8 px south).
- `A1` AllWISE-only at (40, 40); `T1` 2MASS-only at (20, 40).
- `C3` CatWISE at (37, 30) (2 px from the unidentified detection).
- Blend: CatWISE `B1` at (15.5, 30) W1 15.0 and `B2` at (14.3, 30.4) W1 11.0.
- Target split rows: two CatWISE rows 8 and 15 arcsec from the target's MJD 57170 position, with junk pm.
- CatWISE `CQ` at (5, 25) with `cc_flags="D000"` (must be filtered out).
Test detections (`Detection(x, y, snr)`): (24.2, 23.9, 50), (8.0, 40.1, 40), (10.1, 9.9, 30), (30.0, 15.0, 25), (40.0, 40.0, 20), (20.0, 40.0, 15), (15.0, 30.0, 12), (35.0, 30.0, 10), (5.0, 25.0, 9). Frames: `[]` except in the image-motion test.

- [ ] **Step 1: Write the failing geometry tests**

```python
def test_center_pixel():  # every real patch
    assert radec_to_png(g, g["CRVAL1"], g["CRVAL2"]) == pytest.approx((24.0, 24.0), abs=1e-9)

def test_roundtrip():
    x, y = rng.uniform(0, 48, 50), rng.uniform(0, 48, 50)
    assert np.allclose(radec_to_png(g, *png_to_radec(g, x, y)), (x, y), atol=1e-6)

def test_east_left_north_up():
    x1, y1 = radec_to_png(g, g["CRVAL1"] + 0.003, g["CRVAL2"]); x2, y2 = radec_to_png(g, g["CRVAL1"], g["CRVAL2"] + 0.003)
    assert x1 < 24 and y2 < 24

@pytest.mark.parametrize("patch", PATCHES)
def test_target_radec_matches_target_px(patch):  # exact WCS check against stage3 output
    for v in target["visits"]:
        assert radec_to_png(g, *v["target_radec"]) == pytest.approx((v["target_px"]["png_x"], v["target_px"]["png_y"]), abs=0.002)

@pytest.mark.parametrize("patch", PATCHES)
def test_propagated_catalog_matches_target_px(patch):  # linear PM, no parallax: within 0.15 px
    c = target["catalog"]
    for v in target["visits"]:
        ra, dec = propagate(c["ra"], c["dec"], c["pmra"], c["pmdec"], c["ref_epoch_mjd"], v["mjd_mean"])
        assert np.hypot(*(np.subtract(radec_to_png(g, ra, dec), (v["target_px"]["png_x"], v["target_px"]["png_y"])))) < 0.15

def test_propagate_includes_cosdec():
    ra, dec = propagate(10.0, 60.0, 3.6e6, 0.0, 0.0, 365.25)
    assert ra == pytest.approx(12.0, abs=1e-3) and dec == pytest.approx(60.0)
```

- [ ] **Step 2: Write the failing match tests** (load fixture, run `build_objects`, index result by nearest position)

```python
def test_static_catwise_known():          # (10.1, 9.9) -> known, name "CWISE ...C1", reason startswith "CatWISE2020 match within"
def test_fast_mover_backpropagation():    # (30, 15): known, moving True, motion_basis "catalog", pm total ~2000,
                                          # catalogs == ["CatWISE2020", "AllWISE", "2MASS"]; raw MJD57170 position is >3 px away
def test_fast_mover_counted_once():       # no other object lists C2's AllWISE or 2MASS id
def test_allwise_only_known():            # (40, 40): reason endswith "(no CatWISE2020 row)", pm_mas_yr None, moving False
def test_tmass_only_known():              # (20, 40): catalogs[0].catalog == "2MASS"
def test_blend_picks_brightest():         # (15, 30): catalogs[0].id == "B2"
def test_unidentified_reason():           # (35, 30): kind "unidentified", reason == "no CatWISE/AllWISE/2MASS source within 9.2 arcsec",
                                          # name == "Unidentified #001"; motion_basis "none"
def test_flagged_catwise_row_ignored():   # (5, 25) is unidentified because CQ has cc_flags D000
def test_target_split_rows_absorbed():    # stats.n_absorbed == 2; no object name contains the split-row names
def test_forced_target_claims_detection():# forced "bundle target", reason "bundle target", moving True (3000 mas/yr),
                                          # positions["v1"] == target_px(v1) + (0.2, -0.1) within 1e-6
def test_forced_target_without_detection():  # drop the (24.2, 23.9) detection: target still present, detected False,
                                             # snr None, positions == target_px for v1 and v2, placed after all detected objects
def test_comparison_star():               # forced "comparison star", name "Gaia DR3 ...", moving False
def test_positions_cover_all_visits():    # every object has exactly {"v1", "v2"}
def test_ids_and_order():                 # ids "<patch>-001".. in snr-desc order, undetected forced last
def test_catalog_moving_rules():
    assert catalog_moving(1000.0, None, TH) and not catalog_moving(999.9, None, TH)
    assert not catalog_moving(1500.0, 400.0, TH)   # < 5 sigma
def test_image_motion_flag():             # synthetic frames (Task 2 helper style): source moving 1.6 px between v1 and v2 with
                                          # snr>=10 and no catalog row -> moving True, motion_basis "image", image_shift_px ~1.6;
                                          # source moving 0.4 px -> moving False
```

- [ ] **Step 3: Run** `.venv/Scripts/python -m pytest tests/test_geometry.py tests/test_match.py -q` — Expected: FAIL.
- [ ] **Step 4: Implement `geometry.py`, `schema.py`, `make_fixtures.py` (then run it once to write the fixtures), `match.py`.** `grid_wcs` mirrors `grid_wcs` in `pipeline/longbaseline/stage3.py` (ctype TAN, crval, cdelt, crpix from the dict, cunit deg, radesys ICRS); conversions use `wcs_world2pix`/`wcs_pix2world` with origin 0 and `png_y = NAXIS2 - 1 - y`.
- [ ] **Step 5: Run** the same command — Expected: PASS. Also run the full suite: `.venv/Scripts/python -m pytest -q` PASS.
- [ ] **Step 6: Commit** (`git add` the seven files plus the four fixture outputs by path) `-m "feat(objects): pixel geometry, CatWISE-first cross-match and motion flags"`

---

### Task 4: `objects.json` writer, manifest entry, counts report and the five generated patches

**Files:**
- Create: `pipeline/objects/make_objects.py`, `pipeline/objects/tests/test_make_objects.py`
- Modify: `pipeline/objects/schema.py` (add `to_json_dict`)
- Create (generated): `public/data/{barnards-star,eps-indi-b,wise-0855,rw-aur,r-dra}/objects.json`, `pipeline/objects/reports/counts.txt`
- Modify (generated): `public/data/manifest.json` (adds one `"objects"` key per target, nothing else)

**Interfaces:**
- Consumes: everything from Tasks 1 to 3.
- Produces:
  - `schema.to_json_dict(f: ObjectsFile) -> dict` (asdict + rounding rules from the shared schema)
  - `make_objects.build_patch(patch: str, patch_dir: Path, catalog_dir: Path, snapshots: dict, th: Mapping[str, float]) -> tuple[ObjectsFile, MatchStats]`
  - `make_objects.guard_failures(patch: str, f: ObjectsFile, stats: MatchStats) -> list[str]` and `guard_warnings(...) -> list[str]`
  - `make_objects.add_objects_to_manifest(manifest_text: str, patches: Sequence[str]) -> str` (inserts `"objects": "<patch>/objects.json"` right after `"spectrum"` in each entry; output = `json.dumps(d, indent=1)` with no trailing newline; idempotent)
  - `make_objects.format_counts(rows: list[dict]) -> str`
  - CLI: `python make_objects.py [--patch ID ...]` (default all five). Exit 0 if no guard failure, else 1.

Guards (fail the build; objects.json and manifest are written only when every patch passes; the counts report is always written):
- G1 `unidentified / max(detected, 1) > 0.5` (`GUARD_MAX_UNIDENTIFIED_FRACTION`). Reason: CatWISE reaches W1 about 17.5, far deeper than these 49x49 SPHEREx stacks, so nearly every real detection should have a counterpart (planning run: 11 to 13 % unidentified); a majority unidentified means broken alignment, matching or detection, and the design calls it a failure to investigate.
- G2 `median_sep_px > 0.6` (`GUARD_MAX_MEDIAN_SEP_PX`). Reason: with about 1 chance source per circle, G1 alone could pass on a misaligned grid; chance matches have median separation about 1.06 px, true matches 0.1 to 0.25 px.
- G3 bundle target missing or not `kind == "known"`.
- G4 for `barnards-star` and `wise-0855` the bundle target must have `moving == True`.
Warnings (printed and listed in the report, do not fail): unidentified fraction > 0.25; `bright_recovery < 0.7`; `comparison_offset_px > 1.0`; target not detected.

`counts.txt` columns (one row per patch, fixed width, header line first, then a `# thresholds:` line with the THRESHOLDS dict and a `# snapshots retrieved:` line): `patch detected known unidentified moving forced_undetected unid_frac median_sep_px catwise_in_grid chance_per_circle bright_recovery comp_offset_px target_detected target_moving status` (`status` = `PASS` or `FAIL: <guards>`; warnings appended as `# warn` lines).

- [ ] **Step 1: Write the failing tests**

```python
SCHEMA_KEYS = {"version","patch","generated","mean_epoch_mjd","detection_frames","catalog_snapshots","thresholds","counts","objects"}
OBJECT_KEYS = {"id","kind","moving","motion_basis","reason","name","catalogs","pm_mas_yr","ra","dec","catalog_ra","catalog_dec",
               "snr","detected","forced","image_shift_px","positions"}
THRESHOLD_KEYS = set(THRESHOLDS)  # must equal the ObjectThresholds fields in the shared schema

def test_end_to_end_minipatch(tmp_path):
    # copy mini_target.json to tmp/patch/target.json, write synthetic .f32 + mask PNGs for D1,D2 x v1,v2 with the fixture
    # sources drawn in (helper), copy mini CSVs as tmp/catalogs/mini_{catwise,allwise,2mass}.csv
    f, stats = build_patch("mini", patch_dir, catalog_dir, snapshots, THRESHOLDS)
    d = to_json_dict(f)
    assert set(d) == SCHEMA_KEYS and all(set(o) == OBJECT_KEYS for o in d["objects"])
    assert set(d["thresholds"]) == THRESHOLD_KEYS and d["version"] == 1
    assert d["counts"]["known"] + d["counts"]["unidentified"] == len(d["objects"])
    assert all(set(o["positions"]) == {"v1", "v2"} for o in d["objects"])
    json.dumps(d)  # serialisable, no NaN: assert "NaN" not in json.dumps(d)

def test_guard_majority_unidentified():
    assert any("G1" in m for m in guard_failures("x", file_with(detected=10, unidentified=6), stats_ok))

def test_guard_misalignment():
    assert any("G2" in m for m in guard_failures("x", file_ok, stats_with(median_sep_px=0.9)))

def test_guard_moving_targets():
    assert any("G4" in m for m in guard_failures("barnards-star", file_with_target(moving=False), stats_ok))

def test_manifest_insert_is_minimal_and_idempotent():
    src = (DATA_DIR / "manifest.json").read_text(encoding="utf-8")
    out = add_objects_to_manifest(src, PATCHES)
    added = [l for l in difflib.ndiff(src.splitlines(), out.splitlines()) if l.startswith(("+ ", "- "))]
    assert len(added) == 5 and all(l.startswith('+  "objects": "') for l in added)
    assert add_objects_to_manifest(out, PATCHES) == out
```

- [ ] **Step 2: Run** `.venv/Scripts/python -m pytest tests/test_make_objects.py -q` — Expected: FAIL.
- [ ] **Step 3: Implement** `to_json_dict`, `make_objects.py`. `catalog_snapshots` come from `snapshots.json` entries for the patch (`file`, `rows`, `retrieved`, `radius_arcsec`, `service`). Write `objects.json` with `json.dumps(d, indent=1, ensure_ascii=False)`. `generated` = UTC ISO timestamp `YYYY-MM-DDTHH:MM:SSZ`.
- [ ] **Step 4: Run** the full suite — Expected: PASS.
- [ ] **Step 5: Generate the real data**

Run: `cd pipeline/objects && .venv/Scripts/python make_objects.py`
Expected: exit 0; five `objects.json`; `git diff --stat public/data/manifest.json` shows 5 insertions, 0 deletions; `reports/counts.txt` with 5 `PASS` rows; ballpark detections near the planning run (47/31/45/62/5) and unid_frac well under 0.25.

Tuning, only if a guard fails or a warning fires (use the known targets and comparison stars as ground truth; record every change in `config.THRESHOLDS`, it lands in `counts.txt` and `objects.json`):
1. G2 or `comp_offset_px > 1.0`: alignment problem. Re-check `radec_to_png` and the `ra_pm`/arcsec-per-yr handling before touching any threshold.
2. Unidentified objects bunched within 3 px of a masked core: raise `halo_dilate_px` to 2.
3. Unidentified objects mostly at snr 5 to 7: raise `detect_snr` to 6.
4. Target or comparison star unmatched although detected 1.5 to 2.5 px away: raise `forced_radius_px` to 2.5. Change `match_radius_px` (1.5) only if the median separation of CatWISE matches with W1 < 14 exceeds 0.5 px; never above 2.0.
5. If a patch still fails after these, stop and report the counts table; do not loosen G1/G2.

- [ ] **Step 6: Acceptance checks**

Run: `cd pipeline/objects && .venv/Scripts/python - <<'EOF'` with a short script asserting, for each patch, that exactly one object has `forced == "bundle target"` and `kind == "known"`; that object is `moving` for barnards-star, wise-0855 and eps-indi-b and not for rw-aur and r-dra; every object's `positions` keys equal the patch's `target.json` visit ids; no `reason`/`name` contains "new" or "discover" (case-insensitive).
Expected: no assertion error.

- [ ] **Step 7: Commit**

```bash
git add pipeline/objects/make_objects.py pipeline/objects/schema.py pipeline/objects/tests/test_make_objects.py pipeline/objects/reports/counts.txt public/data/manifest.json public/data/barnards-star/objects.json public/data/eps-indi-b/objects.json public/data/wise-0855/objects.json public/data/rw-aur/objects.json public/data/r-dra/objects.json
git commit -m "feat(objects): objects.json writer, manifest entries, counts report for five patches"
```

---

### Task 5: TypeScript types and loader

Read the two Next docs named in Global Constraints first.

**Files:**
- Create: `lib/sky-objects.ts`, `scripts/check-sky-objects.mjs`
- Modify: `lib/bundle-loader.ts` (`BundleManifestEntry`, `LoadedBundleTarget`, `loadBundleTarget`)

**Interfaces:**
- Consumes: the shared schema; `public/data/<patch>/objects.json`; manifest `objects` path.
- Produces:
  - `lib/sky-objects.ts`: every type in the shared schema, exported verbatim, plus `isSkyObjectsFile(x: unknown): x is SkyObjectsFile` (checks `version === 1`, `Array.isArray(objects)`, and each object has string `id`, `kind` in the union, object `positions`). This file must use only erasable TS syntax (no enums/namespaces) and only `import type`, so Node can strip its types.
  - `lib/bundle-loader.ts`: `BundleManifestEntry.objects?: string`; `LoadedBundleTarget.objects: SkyObjectsFile | null`; `loadBundleTarget` fetches `/data/${mEntry.objects}` (in parallel with nothing else blocking: after the manifest entry is known) when present; on missing path, non-OK response, JSON error or failed `isSkyObjectsFile`, it sets `objects: null` and `console.warn`s; it never throws for objects.
  - `scripts/check-sky-objects.mjs`: run with `node --experimental-strip-types scripts/check-sky-objects.mjs`; uses `node:assert/strict`, imports `../lib/sky-objects.ts`; for each of the five patches reads `public/data/<patch>/objects.json` and `target.json` from disk, asserts `isSkyObjectsFile`, and that every object's `positions` keys equal the target's visit ids; prints `ok sky-objects`. Tasks 6 and 7 append checks to this same script.

- [ ] **Step 1: Write the check script** (it fails: `lib/sky-objects.ts` does not exist).
- [ ] **Step 2: Run** `node --experimental-strip-types scripts/check-sky-objects.mjs` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement `lib/sky-objects.ts` and the loader changes.**
- [ ] **Step 4: Verify**
  - `node --experimental-strip-types scripts/check-sky-objects.mjs` -> prints `ok sky-objects` (ExperimentalWarning lines are fine).
  - `npx tsc --noEmit` -> exit 0.
  - `npx eslint lib/sky-objects.ts lib/bundle-loader.ts scripts/check-sky-objects.mjs` -> 0 problems.
- [ ] **Step 5: Commit** `git add lib/sky-objects.ts lib/bundle-loader.ts scripts/check-sky-objects.mjs && git commit -m "feat(viewer): sky objects types and loader"`

---

### Task 6: Marker drawing, hit test and selection on the Blink canvas

Read the two Next docs named in Global Constraints first.

**Files:**
- Create: `lib/object-overlay.ts`
- Modify: `components/viewer/BlinkPlayer.tsx`, `app/viewer/page.tsx` (minimal wiring), `scripts/check-sky-objects.mjs` (append checks)

**Interfaces:**
- Consumes: Task 5 types (`SkyObject`, `PixelPos`), `LoadedBundleTarget.objects`.
- Produces (`lib/object-overlay.ts`, erasable syntax, `import type` only):
  - `MARKER_STYLE = { known: '#34d399', unidentified: '#f472b6', selected: '#ffffff', baseRadius: 6, movingRadius: 10, selectedRadius: 13, lineWidth: 1.5, movingDash: [3, 2] } as const`
  - `HIT_RADIUS_CANVAS_PX = 9`
  - `imageToCanvas(p: PixelPos, scale: number): { x: number; y: number }` = `((png_x + 0.5) * scale, (png_y + 0.5) * scale)`
  - `canvasToImage(x: number, y: number, scale: number): PixelPos` (inverse)
  - `clientToCanvas(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, canvasWidth: number, canvasHeight: number): { x: number; y: number }` (scales by `canvasWidth / rect.width`)
  - `interface MarkerGeometry { id: string; cx: number; cy: number; r: number; color: string; movingRingR: number | null; selected: boolean }`
  - `markerGeometry(obj: SkyObject, visitId: string, scale: number, selectedId: string | null): MarkerGeometry | null` (null when `positions[visitId]` is missing)
  - `hitTest(objects: readonly SkyObject[], visitId: string, canvasX: number, canvasY: number, scale: number, radiusPx?: number): string | null` (nearest marker centre within radius, default `HIT_RADIUS_CANVAS_PX`; tie -> higher snr, null snr lowest)
- Produces (`BlinkPlayer`): new optional props `objects?: readonly SkyObject[]`, `selectedObjectId?: string | null`, `showMarkers?: boolean` (default true); `onPixelClick` changes to `(click: PixelClick) => void` with exported `interface PixelClick { png_x: number; png_y: number; visitId: string; objectId: string | null }`. Markers draw inside `draw()` after the image and crosshair, before the HUD, for the current frame's `visitId`: circle `baseRadius` stroked in the kind colour; moving -> extra dashed ring `movingRadius`; selected -> white ring `selectedRadius`. Add `objects`, `selectedObjectId`, `showMarkers` to `draw`'s deps. Click handler computes canvas coords with `clientToCanvas(e.clientX, e.clientY, canvas.getBoundingClientRect(), canvas.width, canvas.height)`, image coords with `canvasToImage`, `objectId` via `hitTest` (null when markers hidden or no objects).
- Produces (`page.tsx`, minimal): state `selectedObjectId: string | null`; the Blink-mode `BlinkPlayer` gets `objects={loaded?.objects?.objects ?? NO_OBJECTS}` (module constant `const NO_OBJECTS: readonly SkyObject[] = []`), `selectedObjectId`, and `onPixelClick={c => setSelectedObjectId(c.objectId)}` (hit selects, empty sky deselects). This replaces the old click-to-toggle-spectrum; the Spectrum button still toggles it. `loadTarget` sets `setSelectedObjectId(null)` (in the callback, not an effect). Diff-mode players get no objects.

- [ ] **Step 1: Append failing checks** to `scripts/check-sky-objects.mjs`:

```js
import { imageToCanvas, canvasToImage, clientToCanvas, markerGeometry, hitTest, MARKER_STYLE } from '../lib/object-overlay.ts'
assert.deepEqual(imageToCanvas({ png_x: 0, png_y: 0 }, 6), { x: 3, y: 3 })
assert.deepEqual(imageToCanvas({ png_x: 48, png_y: 48 }, 6), { x: 291, y: 291 })
assert.deepEqual(canvasToImage(3, 291, 6), { png_x: 0, png_y: 48 })
// clientToCanvas half-size: canvas 294 drawn at 147 css px
assert.deepEqual(clientToCanvas(100 + 73.5, 50 + 73.5, { left: 100, top: 50, width: 147, height: 147 }, 294, 294), { x: 147, y: 147 })
const A = obj('A', 'known', false, 30, { v1: { png_x: 10, png_y: 10 } })
const B = obj('B', 'unidentified', true, 5, { v1: { png_x: 11, png_y: 10 }, v2: { png_x: 11, png_y: 10 } })
assert.equal(hitTest([A, B], 'v1', 63, 63, 6), 'A')
assert.equal(hitTest([A, B], 'v1', 68, 63, 6), 'B')
assert.equal(hitTest([A, B], 'v1', 63, 90, 6), null)
assert.equal(hitTest([A], 'v2', 63, 63, 6), null)          // no position for v2
const A2 = obj('A2', 'known', false, 99, { v1: { png_x: 10, png_y: 10 } })
assert.equal(hitTest([A, A2], 'v1', 63, 63, 6), 'A2')      // tie -> higher snr
assert.equal(markerGeometry(A, 'v2', 6, null), null)       // markerGeometry missing visit
const gB = markerGeometry(B, 'v1', 6, 'B')
assert.equal(gB.color, MARKER_STYLE.unidentified); assert.equal(gB.movingRingR, 10); assert.equal(gB.selected, true)
assert.equal(markerGeometry(A, 'v1', 6, null).movingRingR, null)
console.log('ok overlay')
```
(`obj(id, kind, moving, snr, positions)` is a small helper in the script building a full `SkyObject`.)

- [ ] **Step 2: Run** the script — Expected: FAIL (module not found).
- [ ] **Step 3: Implement `lib/object-overlay.ts`, the BlinkPlayer changes and the page wiring.**
- [ ] **Step 4: Verify**
  - script prints `ok sky-objects` and `ok overlay`.
  - `npx tsc --noEmit` exit 0; `npx eslint lib/object-overlay.ts components/viewer/BlinkPlayer.tsx scripts/check-sky-objects.mjs` 0 problems; `npx eslint app/viewer/page.tsx` shows only the 4 pre-existing errors.
  - Browser: `npm run dev`, open `http://localhost:3000/viewer/?target=rw-aur`. Markers sit on visible point sources; clicking one draws the white selection ring (pause playback first); clicking empty sky removes it. Do not commit `AGENTS.md`/`next-env.d.ts` changes that `next dev` makes.
- [ ] **Step 5: Commit** `git add lib/object-overlay.ts components/viewer/BlinkPlayer.tsx app/viewer/page.tsx scripts/check-sky-objects.mjs && git commit -m "feat(viewer): object markers, hit test and selection on blink canvas"`

---

### Task 7: Objects list, details panel and legend

Read the two Next docs named in Global Constraints first.

**Files:**
- Create: `lib/object-list.ts`, `components/viewer/ObjectsPanel.tsx`, `components/viewer/ObjectDetails.tsx`, `components/viewer/ObjectsLegend.tsx`
- Modify: `app/viewer/page.tsx`, `scripts/check-sky-objects.mjs` (append checks)

**Interfaces:**
- Consumes: Task 5 types; Task 6 `MARKER_STYLE`, selection state in page.
- Produces (`lib/object-list.ts`, erasable syntax, `import type` only):
  - `type ObjectSortKey = 'snr' | 'kind' | 'name' | 'pm'`; `type SortDir = 'asc' | 'desc'`
  - `sortObjects(objects: readonly SkyObject[], key: ObjectSortKey, dir: SortDir): SkyObject[]` — new array, stable; `snr`/`pm` (pm = `pm_mas_yr.total`) put nulls last in both directions; `kind` asc = known first, ties by snr desc; `name` uses `localeCompare`.
  - `formatPm(pm: ProperMotion | null): string` -> `"10393 mas/yr"` (rounded integer) or `"—"`
  - `simbadUrl(ra: number, dec: number, radiusArcsec = 10): string` -> `https://simbad.cds.unistra.fr/simbad/sim-coo?Coord=${encodeURIComponent(`${ra.toFixed(6)} ${dec >= 0 ? '+' : '-'}${Math.abs(dec).toFixed(6)}`)}&CooFrame=ICRS&CooEpoch=2000&CooEqui=2000&Radius=${radiusArcsec}&Radius.unit=arcsec`
  - `irsaUrl(ra: number, dec: number, radiusArcsec = 10): string` -> `https://irsa.ipac.caltech.edu/cgi-bin/Gator/nph-query?catalog=catwise_2020&spatial=cone&objstr=${encodeURIComponent(`${ra.toFixed(6)} ${dec.toFixed(6)}`)}&radius=${radiusArcsec}&radunits=arcsec&outfmt=1`
- Produces (components, all `'use client'`):
  - `ObjectsPanel({ file: SkyObjectsFile | null, selectedObjectId: string | null, onSelect: (id: string | null) => void, showMarkers: boolean, onToggleMarkers: (v: boolean) => void })` — when `file` is null renders "No object data for this patch". Otherwise: header with counts (`known`, `unidentified`, `high proper motion`), a "Show markers" toggle, sort buttons (S/N default desc, Category, Name, Proper motion; clicking the active key flips direction), and a scrollable list (`max-h-80`) of rows: marker swatch (same colour/ring as the canvas), name, "Known"/"Unidentified", `formatPm`, S/N (`—` when null). Clicking a row calls `onSelect(id)`; the selected row is highlighted and scrolled into view. Below the list, `ObjectDetails` for the selected object.
  - `ObjectDetails({ object: SkyObject, thresholds: ObjectThresholds, onClose: () => void })` — shows name, `id`, category label and `reason`; for unidentified the note "No CatWISE, AllWISE or 2MASS source within {match_radius_arcsec.toFixed(1)} arcsec. This is not a discovery claim."; "High proper motion" badge when moving with basis (`catalog` -> "catalog proper motion", `image` -> "image shift {image_shift_px} px"); proper motion (pmra, pmdec, total, `formatPm`); magnitudes from every `catalogs[].mags`; each catalog with id and `sep_arcsec`; detection RA/Dec (reuse the sexagesimal formatting from `MetadataPanel.tsx`; copy the small helpers, do not modify that file) and catalog RA/Dec when present; S/N or "not measured ({undetected_note})" when `detected` is false (plain "not measured" if the note is missing); links "SIMBAD (coordinates)" -> `simbadUrl`, "IRSA CatWISE (10″ cone)" -> `irsaUrl`, both `target="_blank" rel="noopener noreferrer"`.
  - `ObjectsLegend()` — inline SVG swatches drawn from `MARKER_STYLE` (same radii scaled 1:1, same dash) for: "Known (catalog match)", "Unidentified (no CatWISE/AllWISE/2MASS match)", "High proper motion (≥ 1000 mas/yr, or image shift)", "Selected", plus the existing blue reticle "Predicted target position".
- Page: state `showMarkers` (default true) passed to the Blink `BlinkPlayer`; render `ObjectsLegend` under the Blink player and `ObjectsPanel` at the top of the right column, both only when `mode === 'blink'` and `loaded` is set (`file={loaded.objects}`).

- [ ] **Step 1: Append failing checks** to `scripts/check-sky-objects.mjs`:

```js
import { sortObjects, formatPm, simbadUrl, irsaUrl } from '../lib/object-list.ts'
const X = obj('X', 'known', false, 30, {}, 500), Y = obj('Y', 'unidentified', false, null, {}, null), Z = obj('Z', 'known', true, 50, {}, 2000)
assert.deepEqual(sortObjects([X, Y, Z], 'snr', 'desc').map(o => o.id), ['Z', 'X', 'Y'])
assert.deepEqual(sortObjects([X, Y, Z], 'snr', 'asc').map(o => o.id), ['X', 'Z', 'Y'])
assert.deepEqual(sortObjects([X, Y, Z], 'pm', 'asc').map(o => o.id), ['X', 'Z', 'Y'])
assert.deepEqual(sortObjects([Y, X, Z], 'kind', 'asc').map(o => o.id), ['Z', 'X', 'Y'])
assert.equal(formatPm(null), '—')
assert.equal(simbadUrl(269.4463742, 4.7686831), 'https://simbad.cds.unistra.fr/simbad/sim-coo?Coord=269.446374%20%2B4.768683&CooFrame=ICRS&CooEpoch=2000&CooEqui=2000&Radius=10&Radius.unit=arcsec')
assert.ok(simbadUrl(133.76, -7.24).includes('Coord=133.760000%20-7.240000'))
assert.equal(irsaUrl(269.4463742, 4.7686831), 'https://irsa.ipac.caltech.edu/cgi-bin/Gator/nph-query?catalog=catwise_2020&spatial=cone&objstr=269.446374%204.768683&radius=10&radunits=arcsec&outfmt=1')
console.log('ok list')
```
(extend the `obj` helper with an optional pm total.)

- [ ] **Step 2: Run** the script — Expected: FAIL.
- [ ] **Step 3: Implement** `lib/object-list.ts`, the three components and the page wiring.
- [ ] **Step 4: Verify**
  - script prints `ok sky-objects`, `ok overlay`, `ok list`.
  - `curl -s -o /dev/null -w "%{http_code}" "<irsaUrl output for 269.4463742, 4.7686831>"` -> `200` (SIMBAD is unreachable from this machine; its URL is checked by the assertion only).
  - `npx tsc --noEmit` exit 0; `npx eslint lib/object-list.ts components/viewer/ObjectsPanel.tsx components/viewer/ObjectDetails.tsx components/viewer/ObjectsLegend.tsx scripts/check-sky-objects.mjs` 0 problems; `app/viewer/page.tsx` still only its 4 pre-existing errors.
  - `rg -n -i "discover|new object|new source" components/viewer lib public/data --glob "*.{ts,tsx,json}"` -> only the literal "not a discovery claim" line.
- [ ] **Step 5: Commit** (`git add` the six files by path) `-m "feat(viewer): objects list, details panel and legend"`

---

### Task 8: Integration and final verification

**Files:**
- Modify only if a check below fails: files from Tasks 5 to 7.
- No new files.

**Interfaces:**
- Consumes: everything above. Produces: a verified branch.

- [ ] **Step 1: Automated checks** (all must pass)
  - `cd pipeline/objects && .venv/Scripts/python -m pytest -q` -> all pass.
  - `cd pipeline/objects && .venv/Scripts/python make_objects.py` -> exit 0, `git status --short public/data pipeline/objects/reports` shows only `objects.json` files with a changed `generated` timestamp (revert those with `git checkout -- public/data/*/objects.json pipeline/objects/reports/counts.txt` if nothing else changed).
  - `node --experimental-strip-types scripts/check-sky-objects.mjs` -> `ok sky-objects`, `ok overlay`, `ok list`.
  - `npx tsc --noEmit` -> exit 0. `npx eslint lib components/viewer scripts/check-sky-objects.mjs app/viewer/page.tsx` -> only the 4 pre-existing `app/viewer/page.tsx` errors and the pre-existing `MetadataPanel.tsx` unused-`manifest` warning.
  - `npm run build` -> static export succeeds; `out/data/barnards-star/objects.json` exists.
  - `cat pipeline/objects/reports/counts.txt` -> five `PASS` rows.

- [ ] **Step 2: Browser check** (manual; `npm run dev`, Chrome or Edge, open `http://localhost:3000/viewer/?target=<patch>`). For each of the five patches:
  1. Pause playback. Every marker sits on a visible point source (centre within about half an image pixel, 3 canvas px); no marker on blank sky except unidentified ones that are visibly on a faint source.
  2. The bundle target has a marker on the crosshair (Barnard's Star and R Dra: on the masked/saturated core) and its details read "bundle target"; Barnard's Star, WISE 0855 and eps Indi B show the dashed moving ring.
  3. Step through visits with the arrows: moving markers shift with the source (Barnard's Star about 1.7 px between v1 and v5); static markers stay.
  4. Click a marker: white ring appears, list row highlights, details open. Click empty sky: ring and details disappear. Click a list row: the canvas ring moves to that object.
  5. Legend swatches match the canvas marks (colour, dashed ring, white ring). Toggle "Show markers" off: markers vanish and canvas clicks select nothing; on: back.
  6. Sort by each key; S/N default descending; proper motion shown on every row (`—` when none).
  7. Details links open SIMBAD and IRSA with the object position in the URL.
- [ ] **Step 3: Review Focus checks in the browser**
  1. Narrow window: DevTools device toolbar at 375 px width; the canvas shrinks; clicking a marker still selects that marker.
  2. Select an object, switch band: same object stays selected and its marker is drawn. Switch patch: selection cleared, no console errors. Switch to Diff: no markers and no objects panel; back to Blink: markers return.
  3. DevTools Network -> block request URL `*objects.json`, reload: blink plays, panel shows "No object data for this patch", console shows one warning and no error. Unblock.
  4. Barnard's Star / RW Aur / R Dra: the target has `detected: false` and its details show "not measured (core masked)"; WISE 0855 shows "not measured (no detection above the S/N threshold in the frame stack)".
- [ ] **Step 4: Commit any fixes** by explicit path, `-m "fix(viewer): sky objects integration fixes"`. If nothing changed, no commit.
