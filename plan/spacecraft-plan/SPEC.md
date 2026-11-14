# SPEC: SkyBlink + Blink Battle (NASA Space Apps 2026, "Planet X and SPHEREx")

Team: Sales is Hard (Praful + 1 teammate, virtual). Status: ready-for-agent (once the build window opens Sat Nov 14 09:00 Europe/Berlin).
Challenge: https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/
Target award: Best Use of Data. Secondary: Best Use of Science. Judging criteria: Impact, Creativity, Validity, Relevance, Presentation.

## Problem Statement

SPHEREx is surveying the whole sky in 102 infrared colours, many times over, and its data is public. Even so, an ordinary person (or a student, or a judge) can't type a sky position and *watch* what changed there. Today that takes FITS files of about 65 MB each, knowing which of 6 detectors and which wavelength each pixel samples, reprojecting rotated frames, masking artifacts, and knowing that the catalogue coordinate of a nearby star can be several arcminutes out of date. The challenge asks for a public web tool that takes RA/Dec and plays a little video of SPHEREx images. It has to work on Barnard's Star, Epsilon Indi B, WISE 0855−0714, RW Aurigae and R Draconis.

There are two hidden traps a naive tool falls into:
1. **Stale coordinates.** These are high-proper-motion objects. A tool that centres on the typed J2000 coordinate misses them by 2–4.5′ in SPHEREx epochs.
2. **Tiny motion.** Over SPHEREx's roughly one-year span, Barnard's Star moves about 10″ and WISE 0855 about 8″. That's 1–2 pixels at 6.15″/px with a ~7.5″ PSF, so a raw blink looks like nothing. Worse, WISE 0855's two *full* visits (Oct–Nov 2025, Apr–May 2026) are only ~6 months apart (~4″, 0.7 px); the 1-year lever arm only exists via a partial visit (May 2025, 3 D6 frames). Each raw frame also samples a different wavelength at the target, which makes naive frame-to-frame comparison misleading, especially for the variable stars RW Aur and R Dra.
3. **Too bright / too faint.** Barnard's Star, R Dra and (in D5/D6) RW Aur are far brighter than the SPHEREx single-exposure nonlinearity limit (~11.5 AB in D1–D3, ~10 AB in D5, ~9.75 AB in D6; Explanatory Supplement Table 25), so their cores are flagged OVERFLOW/TRANSIENT or set to NaN. WISE 0855 (W2 ≈ 14 Vega ≈ 17.3 AB, essentially invisible below ~3.5 µm) is only detectable in D5/D6 co-adds; a broadband D1–D6 sum *dilutes* it into noise. Epsilon Indi B (T1+T6 binary, unsaturated, bright) is the one target where a clean SPHEREx spectrum with methane absorption is realistic.

## Solution

**SkyBlink** is a public, no-login web viewer. You type coordinates or a name, or pick one of the five test targets. SkyBlink finds every SPHEREx DR1 and QR3 image covering that spot and corrects the target's position for proper motion at each image's date (it tells you when your typed coordinate is stale and by how much). It groups frames into visits, reprojects them onto one north-up grid, masks flagged and saturated pixels and subtracts zodiacal light. It then plays a smooth blink of per-visit, per-detector-band co-adds in the band where the target is actually visible (D6 for WISE 0855), with a **difference view** that turns motion into a dark/bright dipole, shown next to a non-moving control star so the dipole is believable.

Click any pixel to get a **spectrum on the fly** across 0.75–5 µm (hero example: Epsilon Indi B's methane dip; saturated channels are labelled, not hidden). Toggle the **15-year baseline**, which puts WISE (AllWISE 2010) and NEOWISE (2014–2024) epochs on the same grid and timeline so movers visibly travel arcminutes: WISE 0855 crosses ~2′ (≈20 SPHEREx px). Add **Gaia/CatWISE overlays** that show predicted positions per epoch. Everything lives in the URL, so a view can be shared. An Aladin Lite panel shows the all-sky 102-band HiPS cube for context.

**Blink Battle** is the social hook built on the same engine. Players race to tap the moving object in real SPHEREx patches. Main rounds use asteroids, which move a lot within a visit, scored against IRSA MOST / JPL ground truth. Bonus rounds use fast stars, scored against Gaia/CatWISE. There are live rooms and a leaderboard. A community candidates board collects movers that players flag and that no catalogue explains.

The viewer alone satisfies the brief. The game is a stretch.

Design (already dealt with the taste skill, no violet anywhere):
- SkyBlink: bg #0a0d14, surface #131824, ink #e9edf3, accent #5ab9fc. Manrope + JetBrains Mono. Centred hero over the live app window. Soft radius.
- Blink Battle: bg #2b2216, surface #382d1e, ink #e4e2da, accent #bda38b. Epilogue + JetBrains Mono. Game name set over full-bleed real sky.

## User Stories

### Finding a target
1. As a curious visitor, I want to type RA/Dec in sexagesimal or decimal degrees, so that I can look at any spot in the sky.
2. As a curious visitor, I want to type an object name like "Barnard's Star", so that I don't need to know coordinates.
3. As a visitor, I want one-click chips for the five challenge targets, so that I can see the tool work immediately.
4. As a visitor, I want clear feedback when a position has no SPHEREx coverage yet, so that I'm not left staring at a blank screen.
5. As a visitor, I want a progress indicator while frames load, so that I know the tool is working.
6. As an astronomy student, I want SkyBlink to tell me that the typed coordinate is stale and where the object actually is now, so that I learn why proper motion matters.
7. As a student, I want to see the proper motion used for the correction (mas/yr, source catalogue, reference epoch), so that I can check the correction myself.
8. As a judge, I want WISE 0855's typed brief coordinate to land on the brown dwarf anyway, so that I can see the tool handles the trap in the brief.

### Watching the sky change
9. As a visitor, I want the frames to play as a looping video automatically, so that motion jumps out without effort.
10. As a visitor, I want play/pause, step and speed controls, so that I can study a change frame by frame.
11. As a visitor, I want every frame north-up and aligned on one grid, so that the stars don't jitter because of detector rotation.
12. As a visitor, I want frames grouped and co-added per visit, so that each frame is clean rather than noisy.
13. As a visitor, I want a difference view (visit B minus visit A), so that a mover shows up as an unmistakable dark/bright pair.
14. As a power user, I want to add or subtract any two visits, so that I can make my own comparisons.
15. As a visitor, I want a date stamp and visit label on each frame, so that I know when I'm looking.
16. As a visitor, I want a crosshair at the predicted position for each frame's date, so that I know where to look.
16a. As a sceptical judge, I want the difference view shown next to a non-moving control star, so that I can trust a 1–2 px dipole is real motion.
17. As a visitor, I want to change the field of view, so that I can zoom out for context or in for detail.
18. As a visitor, I want sensible automatic contrast with a manual stretch slider, so that faint objects are visible.

### Wavelength
19. As a student, I want to choose a wavelength channel or a detector band (D1–D6), so that I can see how the sky looks at different infrared colours.
20. As a student, I want comparisons made only within the same channel, so that a colour difference isn't mistaken for a change.
21. As a variable-star fan, I want RW Aur and R Dra brightness compared at the same wavelength across visits, so that I can see real variability.
22. As a visitor, I want a "102 colours" sweep that animates through wavelength at one epoch, so that I can see the SPHEREx spectral cube come alive.

### Spectra
23. As a student, I want to click any pixel and get its spectrum from 0.75 to 5 µm, so that I can see what an object is made of.
24. As a student, I want spectra from different visits overlaid, so that I can see variability in colour.
25. As a student, I want spectral features (H2O, CH4, CO, CO2 bands) marked on the plot, so that I can see why WISE 0855 looks so cold.
25a. As a student, I want saturated or undetected channels marked as such instead of plotted as numbers, so that I don't read artifacts as science.
26. As a researcher, I want to download the spectrum as CSV, so that I can analyse it elsewhere.

### Data quality and metadata
27. As a careful user, I want flagged pixels (ghost, persistence, transient, halo, bloom, snowball) masked out by default, so that artifacts don't look like discoveries.
28. As a careful user, I want to toggle a flag overlay showing which flags hit which pixels, so that I can judge reliability.
29. As a researcher, I want a metadata panel listing each frame's observation ID, detector, MJD, PSF FWHM and source release (DR1/QR3), so that my results are traceable.
30. As a researcher, I want links to the original FITS files, so that I can verify things in my own tools.

### Long baseline
31. As a visitor, I want a "15-year" toggle that adds WISE/NEOWISE epochs from 2010–2024, so that slow movers visibly travel.
32. As a student, I want the baseline epochs clearly labelled as WISE (not SPHEREx), so that I understand the data sources.
33. As a judge, I want WISE 0855 tracked from 2010 to 2026 on one timeline, so that the tool shows a unique use of combined NASA data.

### Overlays and context
34. As a student, I want Gaia DR3 stars overlaid at their positions propagated to each frame's epoch, so that I can tell known stars from unknowns.
35. As a student, I want CatWISE2020 sources overlaid, so that I can see red, faint objects that Gaia misses.
36. As a visitor, I want an Aladin Lite panel with the SPHEREx all-sky HiPS cube around my target, so that I can see where in the sky I am.
37. As a visitor, I want the Aladin panel and the blink viewer centred on the same target, so that the two views agree.

### Sharing
38. As a visitor, I want the coordinates, FOV, band, view mode and frame in the URL, so that I can share exactly what I see.
39. As a teacher, I want to paste a link into class slides, so that students land on the same view.
40. As a visitor, I want a "copy link" button, so that sharing is one click.

### Landing and presentation
41. As a first-time visitor, I want a landing page that shows the live product immediately, so that I understand it in five seconds.
42. As a judge, I want a short "how it works" and a data-sources section with citations, so that I can assess validity.
43. As a mobile visitor, I want the viewer usable on a phone, so that I can share it socially.

### Blink Battle (stretch)
44. As a player, I want to play a solo round where I tap the moving asteroid in a real SPHEREx blink, so that I learn to spot movers in a fun way.
45. As a player, I want my tap scored by distance to the true position and by time, so that skill matters.
46. As a player, I want to see the answer revealed after each round (asteroid name, orbit link), so that I learn something.
47. As a player, I want bonus "fast star" rounds across the 15-year baseline, so that the game ties back to Planet X hunting.
48. As a player, I want to create a room and share a code, so that friends can race me on the same patches.
49. As a room host, I want everyone to see the same round at the same time, so that it's a fair race.
50. As a player, I want a live leaderboard per room and a global daily one, so that there's a reason to come back.
51. As a player, I want to play with a nickname and no account, so that there's no friction.
52. As a player, I want to flag "I see a mover that wasn't the answer", so that I can contribute candidates.
53. As a citizen scientist, I want a community candidates board that cross-matches each flag against Gaia, CatWISE and known asteroids, so that only unexplained movers stand out.
54. As a viewer of the board, I want to open any candidate in SkyBlink, so that I can inspect it.

### Operations
55. As a judge, I want the site public with no login on a stable URL, so that I can evaluate it any time.
56. As the team, we want the five test targets precomputed and cached, so that the demo is fast and survives upstream outages.
57. As the team, we want an automated acceptance suite on the five targets, so that we know the brief is met after every deploy.

## Implementation Decisions

**Architecture.** A Next.js frontend on Vercel, plus a Python "Sky Service" (Astropy, astroquery, NumPy, reproject) behind a single HTTP JSON/PNG API. Supabase is used only for the game (rooms, realtime, leaderboard, candidates). The Sky Service is the one test seam.

**Hosting the Sky Service.** Default: one Vercel project using Vercel Services (Next.js frontend + FastAPI Python service on the same domain, so no CORS between them). Verified on vercel.com/docs (Nov 13): Python bundle limit 500 MB uncompressed (5 GB "large functions" beta), max duration 300 s on Hobby (800 s on Pro), 2 GB memory on Hobby, 4.5 MB max non-streamed response body, default region iad1 (same AWS region as the us-east-1 SPHEREx bucket). Measured locally: numpy+scipy+astropy+astroquery+pyvo ≈ 300 MB installed, so it fits; drop astroquery and reproject (use pyvo/plain HTTP and WCS + scipy.ndimage.map_coordinates for small-cutout resampling) to keep headroom and cold starts down. Disable astropy IERS auto-download and point any cache at /tmp. Ticket 01 only *confirms* this with a real deploy (cold start, bundle size); fallback is a FastAPI container on another host. A backend is mandatory because IRSA SIA, TAP and cutout services send no CORS headers.

**Demo insurance.** The five challenge targets are precomputed offline (a script run on a laptop or CI) into static PNG/JSON assets served from the frontend/Blob, so the demo, the video and judges' first clicks never depend on a live Python cold start or IRSA uptime. Arbitrary coordinates use the live path.

**Data sources.**
- SPHEREx frames come from IRSA SIA v2, collections spherex_dr1 and spherex_qr3. QR2 is ignored. Rows are de-duplicated by observation and detector, preferring DR1.
- Pixel data comes from the public bucket s3://nasa-irsa-spherex (us-east-1) via HTTP range reads of the uncompressed IMAGE extension (a 60-row strip is about 490 KB in about 0.5 s). Verified Nov 13: the bucket answers browser CORS with `Access-Control-Allow-Origin: *` and allows the `Range` header, so client-side reads are possible later; backend reads stay the default. The IRSA cutout service is the fallback (6–9 s, sometimes corrupt), and its responses are validated.
- FLAGS (and possibly VARIANCE/ZODI, unverified) are compressed extensions, so they're read per strip with the HDU decompressor, or via cutout fallback.
- **Saturation.** Pixels flagged OVERFLOW/TRANSIENT/NONLINEAR or NaN in IMAGE are excluded before co-adding. For saturated targets (Barnard, R Dra, RW Aur in D5/D6) the centroid is measured on the unsaturated PSF wings, and spectrum channels are marked `saturated` rather than returned as numbers.
- Wavelength per pixel comes from the WCS-WAVE alternate WCS (key 'W', SIP disabled).
- Proper motion: Gaia DR3 TAP (ESA) first, then CatWISE2020 via IRSA for objects that are faint in Gaia (WISE 0855, possibly Eps Indi B). Propagation uses SkyCoord.apply_space_motion from the catalogue's reference epoch (Gaia 2016.0, CatWISE ~2015.4) to each frame's MJD-AVG; Gaia pmra already includes cos δ. Parallax (≤0.55″ for these targets) is ignored and documented as a <0.1 px effect. A hardcoded vetted table covers the five test targets in case catalogues are down. SIMBAD/CDS name resolution is slow or unreliable, so the five names are local aliases and anything else goes through Sesame with a timeout.
- The long baseline uses W2 (W1 for bright stars). IRSA hosts only *full-depth* unWISE coadds (neo3), not per-epoch ones, so: AllWISE Atlas (2010) and NEOWISE-R single-exposure cutouts (2014–2024), both from IRSA, co-added per ~6-month visit, are the primary source; unwise.me "neo7" epochal coadds (through ~2020, non-IRSA host, the same infrastructure WiseView uses, which was down Nov 13) are the fallback. Precomputed offline for the five targets.
- Context uses the HiPS cube at the IRSA spherex_allsky_cube URL in Aladin Lite.
- Asteroid ground truth comes from IRSA MOST, cross-checked with JPL Horizons. Game rounds are precomputed offline into a curated round set, never live.

**Modules (deep, narrow interfaces).**
- *Target Resolver:* turns a query (coords or name) into a Target: canonical position, reference epoch, pm_ra/pm_dec, parallax if known, source catalogue, and "staleness" (offset between the typed coordinate and the current epoch).
- *Frame Catalogue:* turns a Target and radius into Frames grouped into Visits, each with obs ID, detector, MJD, access URL, S3 key, release, PSF FWHM and the target's wavelength.
- *Strip Reader:* turns a Frame and a pixel window into image, flags, variance and zodi arrays plus the WCS. It hides S3-vs-cutout.
- *Stack Builder:* turns a Target, FOV, channel selection and visits into one aligned frame per visit on a common north-up TAN grid centred on the target's mean position. Steps: PM-corrected crosshair per frame date, zodi subtracted, flags masked, inverse-variance co-add within a visit and channel group, difference products. Output is a PNG (display stretch) plus a float JSON/NPY option and per-frame metadata.
- *Spectrum Extractor:* turns a sky position, visits and an aperture into a list of (wavelength, flux, error, visit, flags) using a small PSF-sized aperture per frame.
- *Baseline Provider:* turns a Target and FOV into WISE/unWISE epoch images on the same grid, with labels.
- *Overlay Provider:* turns a Target, FOV and epoch list into Gaia and CatWISE sources propagated to each epoch.
- *Cache:* results are keyed by request; the five targets are prewarmed and stored in blob storage (Vercel Blob or Supabase Storage).
- *Viewer UI:* the player, difference/add-subtract, channel and band picker, FOV, stretch, flag overlay, metadata panel, spectrum panel, baseline toggle, overlays, URL state.
- *Context Sky:* Aladin Lite with the HiPS cube, synced to the viewer target.
- *Game Service (stretch):* round sets, scoring, rooms with Supabase Realtime, leaderboards, and candidate submissions with cross-match.

**API contract (shape, not final names).**
- resolve(query) gives a Target.
- frames(target, radius) gives Visits[Frames].
- stack(target, fov, channel|band, mode=blink|diff|sum, visits[a,b]) gives image URLs plus metadata.
- spectrum(ra, dec, visits) gives points.
- baseline(target, fov) gives epoch images.
- overlays(target, fov, epochs) gives source lists.
- Errors are structured: no_coverage, upstream_timeout, partial (some frames failed). The UI degrades gracefully.

**Visits.** A visit is a cluster of frames with no gap over 20 days. A *full visit* has frames from all six detectors (typically 15–20 per detector, each at a different LVF wavelength); a *partial visit* has a few frames from some detectors. Partial visits are shown but labelled, and excluded from the default difference unless they add lever arm (WISE 0855 May 2025, D6 only).

**Comparison rule.** Within a visit, co-adds are per detector band (D1…D6): inverse-variance sum of that detector's frames after per-frame normalisation. Frames are only compared across visits within the same detector band, or within the same channel for variables. Each target has a default display band chosen for visibility without saturation: WISE 0855 → D6; Epsilon Indi B → D3; Barnard's Star, RW Aur, R Dra → the least-saturated band, with saturated cores masked. A broadband D1–D6 sum is offered but never the default. Difference views are always shown next to a nearby non-moving control star of similar brightness, so PSF/rotation residuals aren't mistaken for motion.

**URL state.** Holds ra, dec (or target alias), fov, band/channel, mode, visit pair, frame index, baseline on/off and overlays on/off. URL state is the single source of truth for viewer state.

**Game data model (Supabase, stretch).**
- rooms: code, host, state, current_round, started_at.
- players: room, nickname, score.
- rounds: round_set_id, frames, truth positions.
- submissions: player, round, tap xy, time, score.
- candidates: position, epoch pair, reporter, cross-match result, votes.
- Anonymous play, rate limiting and a profanity-filtered nickname. Truth positions are never sent to the client before the reveal.

**Licence and credits.** The repo is Apache-2.0. Every page footer carries the SPHEREx DOIs 10.26131/IRSA678 and 10.26131/IRSA679, the DR1 acknowledgement, and the ESA/Gaia/DPAC, CatWISE, unWISE/NEOWISE, IRSA, Aladin/CDS and JPL credits. No NASA logos appear in any AI-generated asset.

## Testing Decisions

- **One seam:** the Sky Service HTTP API. Tests call the API and assert on external behaviour (positions, counts, spectra, error shapes), never on internals.
- **Acceptance suite:** the five targets. Each slice adds its own checks at the API seam; ticket 07 runs the whole suite live and in the browser. For each target:
  - resolve returns a position within 2″ of the vetted current-epoch position.
  - frames returns at least one visit, and at least two visits where known (WISE 0855: 4 visits, 2 full; Barnard: 6 clusters, 3 full).
  - In every full-visit co-add in the target's default band, the source centroid lies within 1 px (6.15″) of the PM-predicted position (wings-only centroid for saturated targets). WISE 0855: D6 co-add S/N ≥ 5 (if not met, record it and lean on the WISE baseline; that's an honest result, not a failure of the tool).
  - Barnard's Star: the first-vs-last full visit difference shows a dipole with separation matching the PM displacement (~10″, 1.7 px) within 0.5 px, and the control star's residual dipole is < 0.3 px. WISE 0855's SPHEREx-only dipole is *not* a pass criterion (≤1.3 px at low S/N); its motion test lives in the 15-year baseline.
  - Spectrum: Epsilon Indi B returns ≥ 60 channels with S/N ≥ 5 and a depressed 3.3 µm (CH4) channel relative to 3.0 and 4.0 µm; WISE 0855 returns S/N ≥ 3 in at least 5 D5/D6 channels; saturated targets return per-channel `saturated` flags and never crash or return silent NaN.
  - For RW Aur and R Dra, the same-channel flux difference between visits is reported for every channel that is unsaturated in both visits, with an explicit count of channels skipped as saturated.
  - The suite runs against the deployed URL and against recorded fixtures.
- **Fixtures:** a small set of real FITS strips and SIA responses is recorded once and committed (with size limits), so tests run offline and fast. A nightly or manual "live" mode hits IRSA.
- **UI smoke (Playwright):** load each target chip, check the player renders frames, toggle difference, click for a spectrum, and check the URL round-trips.
- **Game (stretch):** scoring is a pure function tested with table cases. Room sync is tested with two headless clients.
- **Prior art:** none, since this is a greenfield repo. The tests established in ticket 01 set the pattern.

## Out of Scope

- Accounts and logins of any kind (the site must be public, no login).
- Discovering new objects scientifically.
- The community candidates board (ticket 15): cut from the hackathon, kept as a "what's next" line on the project page.
- Full-resolution FITS downloads or reprocessing whole 2040×2040 frames in the browser.
- QR2 data. Any non-SPHEREx mission beyond WISE/unWISE, Gaia and CatWISE.
- An AI "detector". Any AI use is disclosed, and AI does not originate the idea.
- Native mobile apps.

## Further Notes

**Rules.**
- No challenge code before Sat Nov 14 09:00 Europe/Berlin.
- Submit by Sun Nov 15 23:59 in the team owner's local time.
- The demo is either a video of 30 s or less or a deck of 7 slides or fewer (including title and intro slides). Going over makes us ineligible. Videos and decks can't be uploaded to the Space Apps site; they go on a public host (YouTube/Drive/repo) and are linked. A non-English voice-over needs English subtitles. No people under 18 in any media.
- Submission is done by clicking "Submit for Judging" on the team's Project tab before the deadline; a saved draft does not count.
- The form has separate NASA Data and Space Agency Partner fields; Gaia DR3 (ESA) counts as partner data. At least one NASA dataset is required for global awards.
- Project page images must be 10 MB or less.
- The References field lists every source.
- AI ("SI") disclosure: AI images and video carry a visible watermark; AI-assisted code and data are acknowledged in descriptive text *and* metadata (README section + a header comment in AI-assisted files); AI-generated content has no NASA logos. The rules also say SI should not be used to come up with the idea of how to solve the challenge. The disclosure text has to be truthful about how this plan was brainstormed, and Praful decides the wording (see REVIEW.md).
- The site gets submitted to FortiGuard for classification.
- The team needs at least 2 members.

**Known risks.**
- Browser S3 range reads: CORS is verified OK (Nov 13), but the reads themselves aren't tested in a browser yet; pixel I/O stays backend-side for now.
- Saturation (Barnard, R Dra, RW Aur) and faintness (WISE 0855 outside D5/D6) are the biggest science risks; see the comparison rule and acceptance criteria. Coverage for Epsilon Indi B, RW Aur and R Dra hasn't been queried yet (first thing in 01/04).
- unWISE epochal coadds aren't on IRSA; the baseline relies on NEOWISE-R single exposures or the unwise.me fallback.
- IRSA SIA lags about a day for QR3.
- The cutout service sometimes returns corrupt responses.
- SIMBAD and WiseView were down on Nov 13.
- The WISE 0855 offset (~2.2′) is an estimate to verify in ticket 04.

**Decided in review (were open questions):**
- Hosting: Vercel Services first (limits verified, fits); container only if 01's deploy fails.
- Precompute the five targets to static assets; arbitrary coordinates stay live and slower.
- RW Aur and R Dra: the story is variability (same-channel flux per visit), not motion.
- Baseline: AllWISE + NEOWISE-R via IRSA first, unwise.me neo7 fallback.
- Demo: a ≤30 s screen-recorded video (no AI footage), with the ≤7-slide deck as backup.
- Epsilon Indi B catalogue/epoch and blending with Eps Ind A: checked in ticket 04 against Gaia DR3 and CatWISE (technical, not a user decision).
- Candidate moderation: moot, since ticket 15 is cut.

**Open questions (only Praful can answer):**
1. Teammate: who is it, what are their skills and hours, have they formally joined the team on the Space Apps site, and who is the Team Owner? The owner's local time sets the real deadline.
2. Blink Battle: keep a solo round as Sunday stretch (recommended), go further to rooms, or drop the game and spend Sunday on polish?
3. AI disclosure wording: the extensions (stale-coordinate fix, 15-year baseline, game) came out of brainstorming with Grok Bot. How do you want that stated, given the rule that SI shouldn't originate the solution idea?
4. Names and domain: keep "SkyBlink"/"Blink Battle" and use a vercel.app subdomain (recommended), or buy a custom domain (needs its own FortiGuard check)?
