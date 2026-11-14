# 09: 15-year WISE/NEOWISE long baseline

**Priority:** MUST (minimum version); full timeline is stretch

**What to build:** A '15 years' toggle puts WISE-era epochs on the same grid and timeline as the SPHEREx visits, so Barnard's Star and WISE 0855 visibly travel arcminutes (WISE 0855 ≈ 2′ ≈ 20 SPHEREx px). The minimum version is three epochs: AllWISE Atlas (2010), one NEOWISE-R visit from 2024 (single exposures co-added), and the latest SPHEREx visit. The full version adds every ~6-month NEOWISE visit. W2 for WISE 0855 (too faint in W1), W1 for bright stars. Epochs are clearly labelled by mission. This is the Best Use of Data story: WISE, NEOWISE and SPHEREx on one timeline, positions checked against Gaia (ESA) and CatWISE.

Data source: IRSA hosts only full-depth unWISE coadds, not per-epoch ones. Primary is AllWISE + NEOWISE-R single-exposure cutouts from IRSA; fallback is unwise.me neo7 epochal coadds (through ~2020, non-IRSA host). Precomputed offline for the five targets.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Minimum: three epochs (2010, 2024, latest SPHEREx) for WISE 0855 and Barnard, resampled to the common grid, labelled with mission and date
- [ ] Timeline shows 2010 to 2026 with a WISE/NEOWISE/SPHEREx legend; baseline toggle in the URL
- [ ] WISE 0855 and Barnard positions follow the PM track across all shown epochs
- [ ] Cached for the five targets as static assets
- [ ] Acceptance suite extended: the WISE 0855 centroid tracks the CatWISE PM within 1 WISE px (2.75″) in every WISE epoch
- [ ] Stretch: every NEOWISE visit 2014–2024 shown
