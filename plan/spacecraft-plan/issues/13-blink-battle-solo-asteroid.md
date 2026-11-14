# 13: Blink Battle: solo asteroid round

**Priority:** STRETCH

**What to build:** A player opens Blink Battle (walnut-tan palette bg #2b2216, surface #382d1e, ink #e4e2da, accent #bda38b, Epilogue + JetBrains Mono, game name over full-bleed real sky), plays five rounds tapping the moving asteroid in real SPHEREx blinks, and gets scored by distance and time against the IRSA MOST / JPL ground truth. The answer is revealed with the asteroid name and a JPL link. A bonus fast-star round uses the 15-year baseline. Round sets are precomputed offline; truth never reaches the client before the reveal.

**Blocked by:** 05, 02 (the offline round-building script can start as soon as 01 exists)

**Status:** ready-for-agent

- [ ] Offline script builds at least 8 asteroid rounds plus 3 fast-star rounds from MOST/Horizons, stored with truth server-side (rounds use frames hours apart within one visit, where main-belt asteroids move many pixels)
- [ ] Fallback if the MOST pipeline isn't producing rounds by Sun 13:30: fast-star rounds only, built from 05/09 output with Gaia/CatWISE truth
- [ ] Scoring is a pure function with table tests
- [ ] Solo game playable end-to-end on mobile and desktop
- [ ] Reveal screen with object name and source link
