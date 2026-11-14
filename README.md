# SkyBlink MVP restore points

Private backup of the SkyBlink NASA Space Apps 2026 MVP, so either live version can be restored.

Live site: https://skyblink-mvp.vercel.app

This repository holds **both**:

1. **Next.js source** — `app/`, `components/`, `lib/`, `api/`, `public/data/`, `scripts/` (synced from the Mac / Cursor Origin agent build at `101cacc`).
2. **Deployed restore points** — prebuilt static sites in `deployed/` and the long-baseline `pipeline/`.

Live demo: https://skyblink-mvp.vercel.app

### Quick start (source)

```bash
npm install
npm run dev
```

See the project README in the repo root for architecture, credits, and deploy notes (`npm run build` produces static export under `out/`).

## Restore points

### v0.1-live — taste-skill design pass

- Branch: `checkpoint/live-2026-11-13`
- Tag: `v0.1-live`
- What it is: the static site that was live on 13 November 2026 after the design pass, before long-baseline mode. The site files are in `deployed/`.
- Instant rollback on Vercel (no rebuild): deployment `dpl_EFtknA9Z9YjoGjf854VyP6rZn14i`

### v0.2-long-baseline — WISE 2010 vs SPHEREx (current)

- Branch: `feature/long-baseline` (default)
- Tag: `v0.2-long-baseline`
- What it is: v0.1 plus the long-baseline blink (WISE 2010 against SPHEREx), the `/long-baseline` page, pipeline scripts under `pipeline/`, and a `RESTORE.md` in this tree. Site files are in `deployed/`.
- Instant rollback on Vercel (no rebuild): deployment `dpl_B8eYfiaQYLXFs1Su494aeud9kW7i`

## How to restore

1. **Instant, no rebuild:** in the Vercel project `skyblink-mvp`, roll production back to the deployment id above (Deployments, then Instant Rollback).
2. **From this repo:** deploy the contents of `deployed/` as a static site (no build step). `deployed/vercel.json` holds the headers and clean URLs.

Do not move the tags. They mark the exact restore commits. Later commits on `feature/long-baseline` (such as this README) sit on top of `v0.2-long-baseline`.
