# 11: Aladin Lite all-sky HiPS context panel

**Priority:** STRETCH

**What to build:** A side panel shows Aladin Lite with the SPHEREx all-sky 102-layer HiPS cube around the current target, synced to the viewer's target and FOV, with a layer slider through wavelengths.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Aladin Lite loads the spherex_allsky_cube HiPS and centres on the URL target
- [ ] Changing the target in the viewer recentres Aladin, and the reverse
- [ ] Labelled as a static co-add (context only, no time dimension)
- [ ] Note: IRSA's HiPS server sends `Access-Control-Allow-Origin: *` (checked Nov 13), so no proxy is needed
