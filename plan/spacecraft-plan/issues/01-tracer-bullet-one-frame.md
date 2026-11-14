# 01: Tracer bullet: coordinates in, one SPHEREx frame out

**Priority:** MUST

**What to build:** A visitor types RA/Dec (sexagesimal or decimal) into a bare page and sees one real SPHEREx image strip around that position, rendered as a PNG with a date stamp. This proves the whole path works: Next.js UI, then Sky Service API, then IRSA SIA (spherex_dr1 + spherex_qr3), then an S3 range read of the IMAGE extension (with cutout fallback), then a display stretch, then the browser. It deploys on the default host (Vercel Services: Next.js + FastAPI in one project; limits already verified, see SPEC) and confirms it with a measured bundle size and cold-start time, falling back to a FastAPI container only if that fails. It sets up the repo (Apache-2.0), CI and the test pattern at the API seam, and records SIA coverage (visit count, full vs partial) for all five targets so later tickets know what data exists.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Repo exists with Apache-2.0 LICENSE and a README stub carrying the SPHEREx DOIs
- [ ] Deployed on Vercel Services (or the fallback); bundle size and cold-start time recorded in the README; IERS auto-download off, caches in /tmp
- [ ] Coverage table for all five targets (frames, visits, full vs partial, detectors) committed
- [ ] On the deployed URL, typing WISE 0855's brief coordinate (08h55m10.831s -07d14m42.53s) returns one D6 frame PNG within 10 s warm (and within 20 s cold), with DATE-OBS, detector and the wavelength at the target shown
- [ ] S3 range-read path used by default; cutout fallback triggers on S3 failure and validates the response (rejects corrupt FITS)
- [ ] Structured error for a position with no coverage
- [ ] One API-level test with a recorded fixture passes in CI
