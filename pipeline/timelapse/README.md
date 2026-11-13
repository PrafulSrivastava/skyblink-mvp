# Time-lapse mode (every WISE/NEOWISE pass, 2010 to 2024, then SPHEREx)

Adds `/time-lapse`: each target plays every six-monthly WISE and NEOWISE pass in order and ends on the SPHEREx
frame, with a scrubbable timeline, speed control, W1/W2 toggle, a fading trail of fitted centroids and the
Gaia/CatWISE predicted proper-motion track. Barnard's Star walks about 28 px (171″) across the run.

## Data
- unWISE time-resolved coadds (one coadd per sky pass, the epochs behind unTimely), fetched through the public
  WiseView backend (`png-animation` endpoint, `window=0`, `unique=1`, linear stretch). The raw unTimely epoch
  FITS images are not public, so the 8-bit PNGs are rebuilt to linear flux from three brightness ranges
  ([-100,1500], [-100,25000], [-100,400000]); each pixel keeps the finest range that is not clipped.
- Image attribution: unWISE / NASA/JPL-Caltech / D. Lang (Perimeter Institute). Lang 2014 AJ 147, 108;
  Meisner, Lang & Schlegel 2018 AJ 156, 69; Meisner, Caselden, Schlafly & Kiwy 2023 AJ 165, 36; WiseView
  (Caselden et al. 2018, ascl:1806.004).
- Last frame: the SPHEREx frame from the long-baseline bundle (`longbaseline/W*/spherex.png`).

## Files
- `tl_fetch.py`: fetch and cache the per-epoch cutouts for a target and band (`tlcache/*.npz`).
- `tl.py`: the pipeline. Reuses the long-baseline 49x49, 6.15″/px grid. Block-mean binning, local-median
  subtraction, one asinh stretch per target and band (median over epochs of each frame's p10 and p99.5, a=0.1).
  Gaussian fit at the propagated Gaia/CatWISE position (with parallax); the fit is used when it lands within
  1.5 px of the prediction, otherwise the prediction. Hollow saturated cores are drawn white and left out of the
  fits. Epochs closer than 60 days are merged (R Dra 48 to 24). Edge-clipped cutouts (eps Indi B) are filled from
  the neighbouring tile at the nearest MJD. Epoch 0 is correlated with the WISE All-Sky frame to check orientation.
  Needs `common.py` and `stage3.py` from `pipeline/longbaseline/`.
- `tl_finalize.py`: writes the `timelapse.json` index (labels, source and normalisation notes).
- `tl_site.py`: copies frames into the static site, upscaled to 980 px nearest-neighbour.
- `tl_gif.py`: preview GIFs.
- `gate-*-final.txt`: taste-skill gate output (PASS) for the time-lapse, landing and long-baseline pages.

## Limits
- R Dra is saturated in most passes; the centroid falls back to the prediction (fits kept in 12/25 W1, 5/25 W2).
- WISE 0855 is faint in W1 (16/24 fits); W2 is the default band for every target.
- 2011 to 2013 has no frames (WISE hibernation).
