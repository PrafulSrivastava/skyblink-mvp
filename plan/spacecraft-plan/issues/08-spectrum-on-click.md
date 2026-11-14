# 08: Spectrum on the fly (click any pixel)

**Priority:** MUST

**What to build:** A visitor clicks any pixel and gets a 0.75–5 µm spectrum built live from every frame covering that point. Wavelength per pixel comes from WCS-WAVE, and flux comes from a PSF-sized aperture with zodi removed and flagged pixels dropped. Visits are overlaid in different colours, H2O/CH4/CO/CO2 bands are marked, saturated channels are marked rather than plotted, and a CSV download is available. This is the 'extra kudos' item; the hero example is Epsilon Indi B (unsaturated T dwarf, methane dip at 3.3 µm).

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Clicking Epsilon Indi B returns ≥ 60 channels with S/N ≥ 5 and a visible 3.3 µm CH4 dip, under 2 s cached and within 30 s live
- [ ] WISE 0855 returns S/N ≥ 3 in at least 5 D5/D6 channels; other channels shown as upper limits
- [ ] Saturated targets return per-channel `saturated` flags (never a crash or silent NaN)
- [ ] Per-visit overlay; error bars from VARIANCE
- [ ] Molecular band annotations on the plot
- [ ] CSV download with wavelength, flux, error, visit, obs ID and flags
- [ ] Acceptance suite extended with the spectrum criteria in the SPEC; clicked position in the URL
