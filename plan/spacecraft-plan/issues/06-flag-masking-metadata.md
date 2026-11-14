# 06: Flag overlay + metadata panel

**Priority:** MUST

**What to build:** Artifacts don't masquerade as discoveries, and the user can see why. Basic saturation/NaN masking already happens in 05; this ticket extends default masking to the artifact flags (PERSIST, GHOST, HALO, SNOWBALL and the rest defined in the header) and adds a toggle that shows a colour-coded flag overlay. A metadata panel lists each contributing frame (obs ID, detector, MJD, release DR1/QR3, PSF FWHM) with a link to its FITS file.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] The FLAGS extension (compressed) is read per strip; the bit definitions come from the header, not hardcoded guesses
- [ ] Masked by default; a toggle shows the unmasked version and the flag overlay legend; overlay state in the URL
- [ ] Metadata panel shows all frames per visit with working FITS links
- [ ] API test: a known flagged pixel in a fixture is excluded from the co-add
