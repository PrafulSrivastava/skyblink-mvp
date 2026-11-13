# Long-baseline blink (WISE 2010 vs SPHEREx 2025 to 2026)

Adds a second viewer mode: a WISE All-Sky Atlas frame from 2010 blinked against a SPHEREx stack of the
same field, on one shared grid, so 16 years of proper motion is visible (Barnard's Star moves 171″, 27.8 px).

## Files
- `lb.py`: the pipeline. Needs the SPHEREx strip cache (`cache/<target>/*.npz`) and `meta/` from the original
  bundle pipeline (stage1/stage2), plus astropy, scipy, pillow, requests. `common.py` and `stage3.py` are copied here
  because `lb.py` imports their helpers (position propagation, frame loading and reprojection).
  1. WISE epoch = mean MJD of the WISE L1b W1 frames covering the propagated position (IRSA IBE `wise/allsky/4band_p1bm_frm`).
  2. WISE All-Sky Atlas W1/W2 intensity cutouts, 480″ (IRSA IBE `wise/allsky/4band_p3am_cdd`, doi:10.26131/IRSA151).
  3. SPHEREx: latest visit with ≥3 frames whose wavelength at the star falls in 2.9 to 3.8 µm (D4, matches W1)
     or 4.0 to 5.0 µm (D5/D6, matches W2); median co-add after the same reprojection as stage3.
  4. Grid: 49x49, 6.15″/px TAN, centred halfway between the WISE-epoch and SPHEREx-epoch positions.
  5. WISE 1.375″ pixels are block-averaged into the grid cells; both images are local-median subtracted and get
     their own asinh stretch between the 10th and 99.5th percentile.
  6. A 2D Gaussian at each predicted position checks the alignment (`fit.*.offset_from_pred_px`).
- `lb_finalize.py`: writes `longbaseline.json` (per-target labels for saturation, blends and no-motion targets).
- `lb_site.py`: copies the bundle into the static site and upscales the display PNGs 20x nearest-neighbour.

## Site changes (static export, patched in place)
- `deployed/long-baseline.html`: the new mode (hero blink with motion arrow, band switch, per-target labels,
  measurement table). Vanilla JS, reads `/data/longbaseline.json` and `/data/<target>/longbaseline/`.
- `deployed/assets/lb-link.js` + one `<script>` tag in `deployed/viewer/index.html`: adds a
  "Long baseline (WISE 2010)" button next to Blink / Diff / Spectrum that opens the mode for the current target.
- `deployed/credits.html`: WISE and NEOWISE acknowledgements.
- `deployed/index.html`: footer link to the new mode.

The Next.js source on `main` does not contain these patches: the live site is a patched static export, and a
rebuild from `main` would drop both the taste-skill pass and this feature.

## Results (fit offset from the catalogue prediction, grid px)
| target | shift | W1 WISE / SPHEREx | W2 WISE / SPHEREx | note |
|---|---|---|---|---|
| Barnard's Star | 171″ (27.8 px) | 0.12 / core masked | 0.09 / 0.14 | SPHEREx core saturated |
| ε Indi B | 76″ (12.3 px) | 0.06 / 0.07 | 0.04 / 0.12 | WISE diffraction streak from ε Indi A |
| WISE 0855 | 129″ (21.0 px) | 0.36 / 0.76 | 0.35 / 0.51 | W1: S/N≈7 in WISE and Gaia-star blend in SPHEREx; use W2 |
| RW Aur | 0.5″ (0.07 px) | 0.13 / 0.42 | 0.16 / 0.33 | no visible motion; variable |
| R Dra | 0.3″ (0.06 px) | 0.05 / core masked | 0.09 / core masked | no visible motion; SPHEREx saturated |
