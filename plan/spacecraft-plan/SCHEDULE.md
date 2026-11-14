# SCHEDULE: Sat Nov 14 09:00 to Sun Nov 15 23:59 (Europe/Berlin, UTC+1)

Lanes: **P** = Praful (+ coding agents), **T** = teammate. Ticket numbers refer to issues/NN-*.md.
Rule: no challenge code before Sat 09:00. Hard submit target **Sun 22:00**. The official deadline is 23:59 in the *Team Owner's* local time; if the owner isn't in Berlin, recompute (open question 1).
Capacity: ~14.5 h Saturday + ~14 h Sunday per person, minus meals; the T lane assumes a teammate who can do frontend and some Python. Re-plan at 09:00 once their skills are known.

## Saturday Nov 14

| Time | P lane | T lane | Gate / note |
|---|---|---|---|
| 09:00–09:30 | Kickoff: re-read challenge page and guides for changes; create repo (Apache-2.0), Vercel project (Services: Next.js + FastAPI); **02** placeholder on the production URL and FortiGuard submission | Confirm teammate has joined the team on the Space Apps site and who the Team Owner is; start the **16** References draft | Team of 2+ confirmed; FortiGuard submitted |
| 09:30–12:00 | **01** SIA query, S3 strip read, D6 PNG, cutout fallback, deploy; record bundle size and cold start; coverage table for all five targets | **01** UI shell (coordinate input, image panel), fixture test in CI; **03** URL-state mechanism | Hosting confirmed by 10:30 (fallback: container) |
| 12:00–12:30 | **02** finish (protection off, uptime check) | **03** finish | **GATE A (12:30): public URL shows a real frame** |
| 12:30–13:15 | Lunch | Lunch | |
| 13:15–15:00 | **04** resolver, PM propagation, five chips, staleness notice | **16** draft project page text; offline precompute script skeleton (five targets to static assets) | |
| 15:00–18:30 | **05** visits, resampling, per-band co-add with saturation masking, blink player | **09** data spike (offline): fetch AllWISE + one NEOWISE-R 2024 visit for WISE 0855 and Barnard, confirm both are detectable in W2/W1 | Spike result decides 09 primary vs unwise.me fallback |
| 18:30–19:15 | Dinner | Dinner | |
| 19:15–21:00 | **05b** difference view, control star, band picker | **07** Playwright smoke; gather API tests into the live suite | **GATE B (21:00): brief met (five targets play PM-corrected blinks, Barnard dipole vs control, suite green on the live URL)** |
| 21:00–23:30 | **08** spectrum on click (Eps Indi B first) | **06** flag overlay and metadata panel | Saturday freeze 23:30; run the precompute for the five |
| 23:30 | Sleep | Sleep | |

## Sunday Nov 15

| Time | P lane | T lane | Gate / note |
|---|---|---|---|
| 08:00–08:30 | Standup; check overnight health and FortiGuard status | Same | |
| 08:30–11:00 | **09** minimum (2010 / 2024 / SPHEREx) on the common grid | **10** landing page (taste skill) | |
| 11:00–12:00 | **08**/**09** suite extensions; re-run precompute; save the project page draft | **10** polish; **11** Aladin panel (cheap stretch) | **GATE C (12:00): all MUST viewer tickets done (06 may slip)** |
| 12:00–12:30 | Lunch | Lunch | |
| 12:30–14:00 | **13** Blink Battle solo: round script + scoring (decide asteroid vs fast-star rounds at 13:30) | **13** game UI in the walnut palette | **GATE D (14:00): a solo round is playable on production, or the game is cut** |
| 14:00–16:30 | **14** rooms (only if GATE D passed) *or* **09** full timeline / polish | **12** overlays (stretch) or mobile pass; **16** screenshots | |
| 16:30–17:30 | Integration, bug bash, full acceptance suite live | Mobile pass, incognito check | |
| **17:30** | **CODE FREEZE** (only fixes for submission blockers after this) | | |
| 17:30–19:30 | **17** record and edit the ≤30 s video (four-beat script, screen capture only, burned-in English captions); backup deck ≤7 slides | **16** final screenshots from the suite, images ≤10 MB | |
| 19:30–20:30 | **16** NASA Data / Space Agency Partner / References / AI disclosure final check | Incognito check of every public link, including the video link | |
| 20:30–21:30 | **17** upload the video to a public host, fill in the form, click **Submit for Judging** | Second-person review of the eligibility checklist | |
| **22:00** | **SUBMITTED** (confirmation screenshot saved) | | Target |
| 22:00–23:59 | Buffer only. No deploys unless the site is down | | Deadline 23:59 Team-Owner-local |

## Cut line

**Ships no matter what (brief satisfied):** 01, 02, 03, 04, 05, 05b, 07, 16, 17. That's a public tool where coordinates or a name play a PM-corrected SPHEREx blink with a difference view, tested on all five targets.

**Above the line (must, cut last, in this order of protection):** 08 spectrum (extra kudos) > 09 minimum 15-year baseline (Best Use of Data story and the video hook) > 10 landing page > 06 flag overlay and metadata.

**Below the line (stretch, cut first):** 14 rooms and leaderboard → 12 overlays → 13 solo game → 09 full timeline → 11 Aladin (cheap, cut last).

**Cut entirely:** 15 candidates board (a "what's next" line on the project page).

**Fallback rules:**
- If GATE A slips past 13:30, use the cutout service only (skip S3 range reads) and keep going. If Vercel Python fails to deploy by 10:30, move the Sky Service to a container host and keep the frontend on Vercel.
- If GATE B slips past 22:00, drop resampling polish: blink same-detector co-adds with a simple shift-and-rotate, keep the difference view, and move 08 to Sunday 08:30 ahead of 09.
- If the 09 spike shows NEOWISE-R single exposures are too shallow for WISE 0855, use unwise.me neo7 epochs (to ~2020) plus AllWISE; if both fail, show the CatWISE-predicted track on the SPHEREx frames and say so.
- If GATE C slips, skip 11 and 12; 09 minimum still beats the game.
- If GATE D fails at 14:00, cut the game and spend the afternoon on polish, the spectrum and the video.
- The precomputed static assets for the five targets are the demo insurance against IRSA, Gaia, SIMBAD or cold-start problems.

## Submission tasks checklist
- [ ] Team has 2 or more members on the Space Apps site; Team Owner and their time zone known (Sat 09:30)
- [ ] FortiGuard URL submitted (Sat 09:30) and category re-checked (Sun 08:00 and 20:30)
- [ ] Public, no-login URL plus public repo (Apache-2.0)
- [ ] Demo: video ≤30 s (checked with ffprobe) OR ≤7 slides including title/intro. Never over. Hosted publicly and linked (can't upload to Space Apps)
- [ ] Project page in English; images ≤10 MB each; no people under 18 in any media
- [ ] NASA Data field (SPHEREx, WISE/NEOWISE, IRSA MOST, JPL Horizons) and Space Agency Partner field (ESA Gaia DR3) filled
- [ ] References: every data set, service, library and font (see ticket 16)
- [ ] AI disclosure: AI-assisted code/data acknowledged in text and metadata; any AI media watermarked; no NASA logos in generated content; idea-origin wording agreed with Praful
- [ ] "Submit for Judging" clicked by Sun 22:00 Europe/Berlin; confirmation saved
