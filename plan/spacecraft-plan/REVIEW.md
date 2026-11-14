# REVIEW: SkyBlink + Blink Battle plan (Space Apps 2026, "Planet X and SPHEREx")

Reviewed Fri Nov 13, 2026 (Europe/Berlin). I read SPEC.md, SCHEDULE.md, all 17 tickets, this morning's research scripts and CSVs (sia_*.csv, epochs_*.csv, props.txt, the guide dumps) and the to-spec / to-tickets templates. No app code was written. Originals are backed up at /tmp/spacecraft-plan.orig.

## Verdict: ship with changes

The core is right. It meets the brief, the stale-coordinate fix is a real Validity and Relevance story, and the WISE→SPHEREx timeline is a good Best Use of Data angle. Template conformance is good: the SPEC has every to-spec section, the tickets use the local-ticket template, and 01 is a true tracer bullet. But the plan assumed the five targets are well-behaved in SPHEREx. They aren't: three saturate and the headline object is nearly invisible. Several acceptance criteria couldn't pass, and the demo leaned on the weakest effect. The game afternoon and the 30 s video were also overloaded. All of this is fixed in the files below.

## Top issues (by severity) and what I changed

1. **Saturation and faintness break the core demo and tests (critical).** The SPHEREx single-exposure nonlinearity limits are ~11.5 AB (D1–D3), 10.2 (D5) and 9.75 (D6) (Explanatory Supplement, Table 25). Barnard's Star (K≈4.5 Vega), R Dra and RW Aur (in D5/D6) are far brighter, so their cores are flagged OVERFLOW/TRANSIENT or NaN. WISE 0855 (W2≈14 Vega ≈17.3 AB) only shows up in D5/D6 co-adds, and the planned default D1–D6 broadband sum would dilute it into noise. So "80+ finite spectrum channels for all five" and "dipole for WISE 0855" were not achievable or not meaningful. (I took the magnitudes from memory; the saturation table is from the supplement.)
   *Changed:* added SPEC trap 3. Each target now has a default band (WISE 0855→D6, Eps Indi B→D3, saturated stars→least-saturated band) and broadband is never the default. Saturation masking moved into 05, and saturated targets get a wings-only centroid. Spectrum criteria are rewritten around **Epsilon Indi B** (unsaturated T dwarf, 3.3 µm CH4 dip) as the hero, with honest `saturated` and upper-limit flags. New user stories 16a and 25a.
2. **WISE 0855's SPHEREx-only motion is below what you can show (high, from our own data).** epochs_WISE0855.csv has 4 visits, but only 2 are full (Oct 31–Nov 14 2025 and Apr 21–May 14 2026), about 6 months apart. That's ~4″, or 0.7 px. The 1-year lever arm only comes from a partial May 2025 visit with 3 D6 frames. Barnard has 3 full visits a year apart (~10″, 1.7 px), which works. A 1–2 px dipole also needs a control, or a judge can call it PSF or rotation residue.
   *Changed:* added full/partial visit definitions. The default difference is first vs last full visit. 05 is split into **05** (blink player) and **05b** (difference with an automatic non-moving control star, plus the band picker). Barnard's dipole is the pass test (±0.5 px, control residual <0.3 px). WISE 0855's motion test moved to the 15-year baseline.
3. **The 15-year baseline data source was wrong (high).** IRSA hosts only *full-depth* unWISE coadds (neo3), not per-epoch ones. The epochal neo7 coadds live on unwise.me/NERSC, run only to ~2020, and sit on the same infrastructure as WiseView, which was down on Nov 13.
   *Changed:* 09 now uses AllWISE (2010) + NEOWISE-R single exposures co-added per visit (IRSA) as the primary, with unwise.me as the fallback. There's a **minimum 3-epoch version** (2010 / 2024 / SPHEREx) as MUST and the full timeline as stretch. The teammate gets an offline data spike on Saturday afternoon, so the risk surfaces before Sunday. There's also a last-resort fallback: CatWISE-predicted track on the SPHEREx frames. (Not verified: whether WISE 0855 is detectable in single NEOWISE W2 exposures. Co-adding a visit should make it work.)
4. **The 30 s video tried to show 7 things, and the upload step was wrong (high, Presentation).** Videos can't be uploaded to Space Apps. They must be hosted publicly and linked, and the project only counts after **"Submit for Judging"** is clicked.
   *Changed:* 17 now has a four-beat script:
   - Hook: "NASA's coordinates are 2′ out of date".
   - The 15-year crawl.
   - The Barnard dipole next to the control star, plus the Eps Indi B methane spectrum.
   - The URL.

   It also adds public hosting, the Submit-for-Judging step, burned-in English captions and no people under 18. The landing hero (10) now loops the 15-year crawl, because a 1 px blink doesn't read at hero size.
5. **Scope: the Sunday game was unrealistic, and some tickets were horizontal or too big (medium-high).** Rooms, realtime and the candidates board in 2 h each, after an untested MOST→Horizons round pipeline, wasn't going to happen. 05 didn't fit in one context window. 07 was a horizontal "write all tests" layer scheduled in parallel with the ticket that blocked it. 03 required params that didn't exist yet.
   *Changed:*
   - 15 is **CUT** (a "what's next" line on the project page).
   - 14 runs only if 13 is live by 14:00.
   - 13 now needs 8 rounds instead of 15, and has a fast-star-only fallback decided at 13:30.
   - Gate D moved from 14:30 to 14:00.
   - Each slice owns its own API tests. 07 now gathers them, runs them live plus Playwright, and is blocked by 05b.
   - 03 builds the mechanism, and each later ticket adds its own URL params.
   - 06 is now overlay plus metadata, since the masking itself is in 05.
6. **Hosting was over-spiked, and the demo path depended on cold starts (medium).** *Verified on vercel.com/docs today:*
   - Python bundle limit is 500 MB uncompressed (5 GB beta).
   - Max duration is 300 s on Hobby and 800 s on Pro.
   - Hobby memory is 2 GB.
   - The non-streamed response cap is 4.5 MB.
   - Default region is iad1, the same region as the us-east-1 SPHEREx bucket.
   - Vercel Services runs Next.js and FastAPI on one domain.

   *Measured:* numpy+scipy+astropy+astroquery+pyvo is ≈300 MB installed, so it fits.
   *Changed:* the default is now Vercel Services, and 01 only confirms it, with a container as the fallback. reproject and astroquery are dropped (WCS + map_coordinates instead). IERS auto-download is off and caches go to /tmp. The five targets are **precomputed offline into static assets**, so the demo never touches a cold start or IRSA. (Not measured: actual cold-start time.)
7. **Compliance gaps (medium).**
   - The form has separate NASA Data and **Space Agency Partner** fields; Gaia DR3 (ESA) counts as partner data.
   - AI-assisted code must be acknowledged in text *and* metadata.
   - The plan said "the idea originated with the team". The rules say SI shouldn't be used to come up with the solution idea, and the extensions came out of brainstorming with Grok Bot, so that sentence may not be true. That's for Praful to word (open question 3).
   - FortiGuard can be submitted at 09:30 with a placeholder page instead of at 12:30.

   *Changed:* tickets 02, 16 and 17, the SPEC rules section and the schedule checklist.
8. **Smaller fixes.**
   - *Verified today:* the SPHEREx S3 bucket sends `Access-Control-Allow-Origin: *` and allows `Range`, and the IRSA HiPS server sends ACAO `*`. The "browser S3 untested" risk is downgraded and 11 needs no proxy.
   - Stale coordinates: WISE 0855's brief position is ~2.1′ (~20 px) off-centre, not out of frame. The wording is softened so the Validity claim stays accurate.
   - PM propagation now spells out apply_space_motion, that Gaia pmra already includes cos δ, and that parallax is ignored (<0.1 px).
   - SIA is queried at the propagated position.
   - Eps Indi B's catalogue and contamination from Eps Ind A became an acceptance check in 04.
   - The coverage of Eps Indi B, RW Aur and R Dra hasn't been queried yet. That's now a 01 deliverable.

## Changed files
- **SPEC.md:** trap 3; the Solution, hosting, demo-insurance, data-source, saturation, PM, visit and comparison-rule decisions; acceptance criteria; out of scope (15); rules; risks; open questions trimmed from 12 to 4 (the rest are recorded as decided); stories 16a and 25a.
- **Tickets:** 01, 02, 03, 04, **05 (renamed 05-coadd-blink-player)**, **05b (new)**, 06, 07, 08, 09 (rewritten), 10, 11, 13, 14, 15 (CUT), 16, 17 (rewritten). 12 is unchanged.
- **SCHEDULE.md:** rebuilt (see the cut line below).

## Disagreements left for Praful
- **Keep the game at all?** I'd keep only a solo Blink Battle round as Sunday stretch. You asked for a social idea, but rooms and leaderboards add little to judging compared with a polished viewer and video. I left 14 in the plan as conditional rather than deleting it.
- **Name and pitch:** "SkyBlink" is fine. The stronger one-liner is the stale-coordinate hook ("NASA's coordinates are out of date; we found where the stars went"), more than "anyone can discover a new world". I changed the video script, not the name.
- **Container vs Vercel:** I made Vercel Services the default. If you'd rather avoid any Python-on-Vercel risk, a container host is the fallback, but it needs a new account.

## Open questions (only Praful can answer)
1. Who is the teammate, what are their skills and hours, have they formally joined the Space Apps team, and who is the Team Owner (whose local time sets the deadline)?
2. Blink Battle: solo stretch only (recommended), rooms too, or drop it?
3. AI disclosure: how do we truthfully describe the brainstorming with Grok Bot, given the "SI shouldn't originate the idea" rule?
4. Keep the names, and use a vercel.app URL (recommended) or a custom domain (which needs its own FortiGuard check)?

## Verification log
- Verified: Vercel limits (docs, Nov 13); the S3 and HiPS CORS headers (curl, Nov 13); the visit structure from epochs_*.csv; the saturation limits (SPHEREx Explanatory Supplement, Table 25); that unWISE epochs aren't on IRSA (IRSA unWISE overview page); the submission rules (deadline in Team-Owner time, video ≤30 s / ≤7 slides, external hosting, SI watermarking and acknowledgement, partner-data field) from this morning's guide dumps.
- Not verified: WISE 0855 S/N in D6 co-adds and in NEOWISE single exposures; Eps Indi B / RW Aur / R Dra coverage; cold-start time; whether VARIANCE/ZODI are compressed; whether a submitted project can still be edited afterwards; the team-size ≥2 rule (from the earlier session, not re-checked).
