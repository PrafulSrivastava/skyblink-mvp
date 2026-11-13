# SkyBlink restore point v0.1-live (2026-11-13)

`deployed/` is the exact static site that was live on https://skyblink-mvp.vercel.app on 2026-11-13
(the taste-skill design pass on top of the Next.js 14 static export). It is byte-identical to
`/workspace/checkpoints/skyblink-v0.1-live.tar.gz` on the bot's box
(sha256 fc7ed0832a161fc18526d5e1dcda9c8176525c0f8e3743dba124aa60d6c4768c).

This branch has no shared history with `main` on purpose: `main` keeps the original Next.js source untouched.

## How to go back to this version
1. Instant: in Vercel, project `skyblink-mvp`, roll production back to deployment
   `dpl_EFtknA9Z9YjoGjf854VyP6rZn14i` (Deployments > that deployment > "Instant Rollback", or the API
   `request_rollback`). No rebuild needed.
2. From this branch: deploy the contents of `deployed/` as a static site (no build step, output dir = that folder,
   `deployed/vercel.json` holds the headers and clean URLs).
