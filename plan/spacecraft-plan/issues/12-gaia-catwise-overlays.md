# 12: Gaia DR3 / CatWISE overlays propagated per epoch

**Priority:** STRETCH

**What to build:** Toggleable overlays mark Gaia DR3 and CatWISE2020 sources in the field at their positions propagated to each displayed frame's epoch, so known stars ride along with the blink and unknowns stand out. Hover shows the ID, magnitude and PM.

**Blocked by:** 04, 05

**Status:** ready-for-agent

- [ ] Cone query via the backend (Gaia TAP, IRSA CatWISE) with timeout and caching
- [ ] Markers move with the epoch for high-PM sources
- [ ] Toggle state in the URL; hover tooltip
