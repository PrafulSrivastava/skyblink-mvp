# 05b: Difference view, add/subtract and band picker

**Priority:** MUST

**What to build:** A visitor toggles Difference mode (visit B minus visit A, defaulting to first vs last full visit) and sees a mover as a dark/bright dipole, shown side by side with a nearby non-moving control star of similar brightness so PSF and rotation residuals aren't mistaken for motion. Power users can add or subtract any two visits and switch band (D1–D6, a single channel, or a non-default broadband sum). Comparisons only ever happen within the same detector band or channel.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Difference of first vs last full visit by default; any visit pair selectable; mode and visit pair in the URL
- [ ] Control star picked automatically (Gaia, PM < 20 mas/yr, similar brightness, unsaturated if possible) and its residual shown
- [ ] Barnard's Star dipole separation matches the PM displacement (~1.7 px) within 0.5 px; control-star residual < 0.3 px (API test)
- [ ] Band picker: D1–D6, single channel, broadband sum (labelled "dilutes faint red objects")
- [ ] WISE 0855 difference is displayed with an honest note ("≤1.3 px at low S/N, see the 15-year view") rather than claimed as a detection
