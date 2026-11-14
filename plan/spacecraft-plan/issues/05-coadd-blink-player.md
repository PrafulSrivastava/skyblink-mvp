# 05: Per-visit co-add blink player (target-visible band)

**Priority:** MUST

**What to build:** A visitor sees a smooth looping blink of clean per-visit images of the target, all north-up on one common grid and centred on the PM-corrected position, with a crosshair at each date's predicted position. Each frame is a per-visit, per-detector-band co-add (D1…D6) in the target's default band (WISE 0855 → D6, Eps Indi B → D3, saturated stars → least-saturated band). Flagged, saturated (OVERFLOW/TRANSIENT/NaN) pixels are excluded before co-adding and ZODI is subtracted (or a local median, if better). Full visits and partial visits are labelled. Play/pause/step/speed, FOV and stretch controls. The difference view is ticket 05b.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Frames grouped into visits (gap > 20 d) and marked full/partial; within a visit, inverse-variance co-add per detector band
- [ ] Small-cutout resampling to a north-up TAN grid (WCS + map_coordinates; no reproject dependency); no visible rotation jitter between visits ~180° apart in roll
- [ ] Saturated/flagged pixels masked before co-adding; masked cores shown as a neutral hatch, not black holes
- [ ] Date, visit label and band burned into each frame and shown in the UI; band and frame in the URL (03)
- [ ] API test: source centroid within 1 px of the PM prediction in each full-visit co-add for Barnard (wings-only centroid) and Eps Indi B; WISE 0855 D6 co-add S/N recorded (target ≥ 5)
- [ ] The five targets precomputed offline to static assets; a cached load takes under 3 s
