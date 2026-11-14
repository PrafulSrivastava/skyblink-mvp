# 04: Proper-motion-corrected targeting + target resolver

**Priority:** MUST

**What to build:** A visitor can type a name or coordinates, or click one of five target chips. SkyBlink resolves the object and its proper motion (Gaia DR3, then CatWISE2020, then a vetted local table for the five), and centres every frame on where the object actually was on that frame's date. When the typed coordinate is stale, a 'Your coordinate is X′ out of date; here's where it is now' notice appears with the PM values and the catalogue they came from.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Five target chips: Barnard's Star, Epsilon Indi B, WISE 0855-0714, RW Aurigae, R Draconis
- [ ] Resolver returns position, epoch, pm_ra, pm_dec and source; it times out gracefully when Gaia, CatWISE or Sesame is down and falls back to the local table
- [ ] The brief's WISE 0855 coordinate lands on the brown dwarf; the measured staleness offset (expected ~2.1′: ~8.1″/yr × ~15.5 yr since the WISE discovery epoch, i.e. ~20 SPHEREx px off-centre, not out of frame) is shown and recorded
- [ ] Barnard's Star staleness of ~4.5′ shown when J2000 coordinates are typed
- [ ] Per-frame predicted position computed from each frame's MJD-AVG with apply_space_motion from the catalogue epoch (Gaia pmra includes cos δ); the SIA search uses the propagated position, not the typed one
- [ ] Epsilon Indi B: catalogue/epoch chosen (Gaia DR3 vs CatWISE) and contamination from Eps Ind A (~400″ away, heavily saturated) checked and noted
- [ ] Target alias in the URL (03)
- [ ] API tests: resolver output for all five within 2″ of vetted values
