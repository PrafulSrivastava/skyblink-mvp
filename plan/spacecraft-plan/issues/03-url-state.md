# 03: Shareable URL state

**Priority:** MUST

**What to build:** The URL is the single source of truth for viewer state. This ticket builds the mechanism with the params that exist after 01 (target alias or ra/dec, fov) plus the Copy-link button; every later ticket that adds a control adds its param here as one of its own acceptance criteria (band, mode, visit pair, frame, baseline, overlays).

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Changing any control updates the URL without a full reload
- [ ] Opening a URL with params restores identical state
- [ ] Invalid params fall back to safe defaults with a visible notice
- [ ] Copy-link button copies the current URL
- [ ] A typed param schema exists so later tickets can add params with one line plus a round-trip test
