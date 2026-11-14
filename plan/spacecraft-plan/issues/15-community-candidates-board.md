# 15: Community candidates board

**Priority:** CUT (not scheduled for the hackathon; listed on the project page as "what's next")

**What to build:** During any round, players can flag 'I see another mover'. Flags are cross-matched against Gaia, CatWISE and known asteroids (MOST). Unexplained flags go to a public candidates board, with votes and an 'open in SkyBlink' link, plus honest caveats (artifacts are likely).

**Blocked by:** 13 (and 12 for the cross-match)

**Status:** ready-for-agent

- [ ] Flag submission stores position, epoch pair and reporter nickname
- [ ] Automatic cross-match labels each candidate as known star / known asteroid / unexplained
- [ ] Board lists unexplained candidates with votes and a deep link into the SkyBlink URL state
- [ ] Rate-limited; caveat text visible
