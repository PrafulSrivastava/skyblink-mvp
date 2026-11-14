# 07: Automated acceptance suite on the five challenge targets

**Priority:** MUST

**What to build:** The per-slice API tests (04, 05, 05b, later 08, 09) are gathered into one command that runs against recorded fixtures in CI and against the live deployed URL, plus a Playwright smoke test that clicks each chip in a real browser. This is the 'brief met' gate and produces the results table for the project page. It does not invent new criteria; it runs the ones in the SPEC.

**Blocked by:** 05b (the fixture/CI pattern itself comes from 01)

**Status:** ready-for-agent

- [ ] API suite covers all five targets: resolve, frames (visit counts as expected), centroid within 1 px in the default band, Barnard dipole with control star
- [ ] RW Aur and R Dra: same-channel flux per visit reported for unsaturated channels, with a count of skipped saturated channels (no silent NaN)
- [ ] Live mode runs against the production URL; fixture mode runs offline in CI
- [ ] Playwright smoke: each chip renders at least 2 frames, difference toggle works, URL round-trips
- [ ] Results table written to the README (screenshot-able for the project page)
