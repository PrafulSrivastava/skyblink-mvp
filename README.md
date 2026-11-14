# SkyBlink MVP restore points

Private backup of the SkyBlink NASA Space Apps 2026 MVP, so either live version can be restored.

Live site: https://skyblink-mvp.vercel.app

This repository is a backup of the deployed static site (and, on the current branch, the long-baseline pipeline). It is not the original Next.js source, which lives on Cursor Origin at [praful-srivastava/skyblink-mvp](https://cursor.com/codebase/praful-srivastava/skyblink-mvp).

## Restore points

### v0.1-live — taste-skill design pass

- Branch: `checkpoint/live-2026-11-13`
- Tag: `v0.1-live`
- What it is: the static site that was live on 13 November 2026 after the design pass, before long-baseline mode. The site files are in `deployed/`.
- Instant rollback on Vercel (no rebuild): deployment `dpl_EFtknA9Z9YjoGjf854VyP6rZn14i`

### v0.2-long-baseline — WISE 2010 vs SPHEREx

- Branch: `feature/long-baseline` (default)
- Tag: `v0.2-long-baseline`
- What it is: v0.1 plus the long-baseline blink (WISE 2010 against SPHEREx), the `/long-baseline` page, pipeline scripts under `pipeline/`, and a `RESTORE.md` in this tree. Site files are in `deployed/`.
- Instant rollback on Vercel (no rebuild): deployment `dpl_B8eYfiaQYLXFs1Su494aeud9kW7i`

### v0.3-time-lapse — every WISE/NEOWISE pass 2010 to 2024, then SPHEREx

- Branch: `feature/time-lapse` (built on `feature/long-baseline`)
- What it is: v0.2 plus the `/time-lapse` page (23 to 24 unWISE passes per target plus the SPHEREx frame, W1 and W2), a Time-lapse link in the viewer, landing and credits updates, and the pipeline under `pipeline/timelapse/`. Site files are in `deployed/`.
- Vercel production deployment: `dpl_CEKK7tYXa22eMkp98uihd1jxLkwD`. To go back to v0.2, roll back to `dpl_B8eYfiaQYLXFs1Su494aeud9kW7i`.

### v0.4-asteroids — SPHEREx frames hours apart, find the asteroid (current)

- Branch: `feature/asteroids` (built on `feature/time-lapse`)
- What it is: v0.3 plus the `/asteroids` page (433 Eros, 21 Lutetia, 16 Psyche, 1036 Ganymed; JPL Horizons track overlay, find-it scoring), an Asteroids nav item, viewer button, home and credits links, and the pipeline under `pipeline/asteroids/`.
- Vercel production deployment: `dpl_CVGLgoVSJZXjTQz9kV17RfzStvKG`. To go back to v0.3, roll back to `dpl_CEKK7tYXa22eMkp98uihd1jxLkwD`.

## How to restore

1. **Instant, no rebuild:** in the Vercel project `skyblink-mvp`, roll production back to the deployment id above (Deployments, then Instant Rollback).
2. **From this repo:** deploy the contents of `deployed/` as a static site (no build step). `deployed/vercel.json` holds the headers and clean URLs.

Do not move the tags. They mark the exact restore commits. Later commits on `feature/long-baseline` (such as this README) sit on top of `v0.2-long-baseline`.
