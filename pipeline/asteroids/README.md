# Asteroids: the fast mode (v0.4)

Real SPHEREx exposures taken minutes to hours apart, with JPL Horizons positions.

1. `select2.py` reads IRSA MOST results (`catalog=spherex`, 2025-03-11 to 2026-11-01, one table per asteroid in `most/`)
   and ranks same-detector windows by number of visits and motion (5 to 60 px of 6.15″). Output: `windows.json`.
2. `fetch.py` range-reads native IMAGE/VARIANCE/FLAGS strips and the WCS-WAVE table from `s3://nasa-irsa-spherex` (DR1/QR3 only).
3. `build.py` queries JPL Horizons (observer SPHEREx, `500@-163182`) at each exposure's MJD-AVG, reprojects every frame to one
   89 × 89 px north-up TAN grid, builds a still-sky median (the asteroid drops out), Gaussian-fits the asteroid on the
   still-sky-subtracted frame and records flags within 2 px. OUTLIER/TRANSIENT are reported, never masked (they fire on the mover).
4. `finalize.py` keeps Eros (2026-03-13), Lutetia, Psyche and Ganymed, writes `data/asteroids.json` and 11× nearest-neighbour PNGs.
5. `assemble.py` builds `asteroids.html` from `src/` on top of `time-lapse.html` and adds the nav, footer, home and credits links.

Dropped: 7 Iris and 15 Eunomia (saturated in every frame), Eros July 2025 (duplicate, slower),
Phaethon / Geographos / Florence / Toutatis (predicted V 18.5 to 21.6, not attempted).
