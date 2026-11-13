"""Time-lapse: every unWISE time-resolved epoch (2010 to 2024) plus the SPHEREx epoch, on the long-baseline grid.

For each target and WISE band (W1 3.4 um, W2 4.6 um):
 1. Fetch every single-epoch unWISE time-resolved coadd cutout (tl_fetch.py; ~6-month cadence, neo11 epochs).
    Epochs closer than MERGE_DAYS (only near the ecliptic pole, R Dra) are averaged into one frame.
 2. Bin the native 2.75"/px pixels into the long-baseline 49x49, 6.15"/px TAN grid (same centre as
    longbaseline.json, flux-conserving block mean, local-median subtracted). Orientation is verified by
    cross-correlating epoch 0 with the 2010 WISE All-Sky frame already on that grid.
 3. Frame-to-frame normalisation: ONE asinh stretch per target and band, between the median over epochs of each
    frame's 10th and 99.5th percentile, so the field stars keep the same brightness and nothing flickers.
 4. Predict the target position at each epoch from Gaia DR3 / CatWISE2020 motion and parallax, fit a 2D Gaussian
    there, and keep the fitted centroid when it lands within 1.5 px of the prediction (else fall back to the prediction).
 5. Append the SPHEREx frame from the long-baseline bundle (matched band: W1 <-> D4, W2 <-> D5/D6), with its own
    stretch (MJy/sr, different units), its date and fit.
 6. Write data/<id>/timelapse/<band>/fNN.png (+ masks) and timelapse.json; a dense predicted track every 30 days.
"""
import sys, os, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from stage3 import *
from tl_fetch import fetch
from astropy.wcs import WCS
from astropy.time import Time
from astropy.stats import sigma_clipped_stats
from PIL import Image
OUTROOT = "/workspace/skyblink-data"
MERGE_DAYS = 60
T = ['barnards-star', 'eps-indi-b', 'wise-0855', 'rw-aur', 'r-dra']

def cutout_wcs(h, orient):
    w = WCS(naxis=2); w.wcs.ctype = ['RA---TAN', 'DEC--TAN']; w.wcs.crval = [h['CRVAL1'], h['CRVAL2']]
    w.wcs.crpix = [h['CRPIX1'], h['CRPIX2']]; w.wcs.cdelt = [-2.75 / 3600, 2.75 / 3600]
    return w

def bin_to_grid(img, w, g):
    ny, nx = img.shape; yy, xx = np.mgrid[0:ny, 0:nx]
    ra, dec = w.wcs_pix2world(xx.ravel(), yy.ravel(), 0); gx, gy = g.wcs_world2pix(ra, dec, 0)
    ix, iy = np.round(gx).astype(int), np.round(gy).astype(int); v = img.ravel()
    ok = (ix >= 0) & (ix < NPIX) & (iy >= 0) & (iy < NPIX) & np.isfinite(v)
    s = np.zeros((NPIX, NPIX)); n = np.zeros((NPIX, NPIX))
    np.add.at(s, (iy[ok], ix[ok]), v[ok]); np.add.at(n, (iy[ok], ix[ok]), 1)
    with np.errstate(all='ignore'): return np.where(n > 0, s / n, np.nan)

def corr(a, b):
    m = np.isfinite(a) & np.isfinite(b); a, b = a[m] - a[m].mean(), b[m] - b[m].mean()
    return float((a * b).sum() / np.sqrt((a * a).sum() * (b * b).sum()))

def r(v, n=3): return None if v is None or not np.isfinite(v) else round(float(v), n)

def main(tid):
    cat = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'meta/catalog.json')))[tid]; c0 = star_coord(cat)
    lb = json.load(open(f"{OUTROOT}/{tid}/longbaseline/longbaseline.json"))
    gd = lb['grid']; g = grid_wcs(gd['CRVAL1'], gd['CRVAL2'])
    od = f"{OUTROOT}/{tid}/timelapse"
    out = dict(id=tid, name=lb['name'], grid=gd, motion=lb['motion'], bands={})
    all_mjd = []
    for b in (1, 2):
        key = f"W{b}"
        # WiseView clips a cutout at its unWISE tile edge. If the grid is not fully covered, fill the gap from cutouts
        # centred a little away (they come from the neighbouring tile), epoch by epoch at the nearest MJD (within 30 days).
        cd = np.cos(np.radians(gd['CRVAL2']))
        d = fetch(tid, gd['CRVAL1'], gd['CRVAL2'], b); h = json.loads(str(d['hdr'])); w = cutout_wcs(h, None)
        alts = []
        if not (h['NAXIS1'] == 171 and h['NAXIS2'] == 171):
            for k, (dra, ddec) in enumerate([(0, .06), (0, -.06), (.06 / cd, 0), (-.06 / cd, 0)], 1):
                da = fetch(tid, gd['CRVAL1'] + dra, gd['CRVAL2'] + ddec, b, tag=f'_s{k}'); ha = json.loads(str(da['hdr']))
                ia = np.moveaxis(np.flipud(np.moveaxis(da['img'], 0, -1)), -1, 0)
                alts.append((da, cutout_wcs(ha, None), ia, ha))
        cut_centre = [float(d['ra']), float(d['dec'])]
        imgs = np.flipud(np.moveaxis(d['img'], 0, -1)); imgs = np.moveaxis(imgs, -1, 0)   # PNG row 0 = north -> FITS row 0 = south
        def grid_of(i):
            gg = bin_to_grid(imgs[i], w, g)
            for da, wa, ia, ha in alts:
                if np.isfinite(gg).all(): break
                j = int(np.argmin(np.abs(da['mjd'] - d['mjd'][i])))
                if abs(da['mjd'][j] - d['mjd'][i]) > 30: continue
                ga = bin_to_grid(ia[j], wa, g); hole = ~np.isfinite(gg) & np.isfinite(ga)
                if hole.any():   # match the sky level on the overlap before filling
                    ov = np.isfinite(gg) & np.isfinite(ga)
                    off = float(np.median(gg[ov] - ga[ov])) if ov.sum() > 20 else 0.0
                    gg = np.where(hole, ga + off, gg)
            return gg
        # orientation check against the 2010 WISE All-Sky frame on the same grid
        ref = np.flipud(np.array(Image.open(f"{OUTROOT}/{tid}/longbaseline/{key}/wise.png"), float))
        cc_ok = corr(bin_to_grid(imgs[0], w, g), ref); cc_flip = corr(bin_to_grid(d['img'][0], w, g), ref)
        # merge epochs closer than MERGE_DAYS
        groups = []
        for i in np.argsort(d['mjd']):
            if groups and d['mjd'][i] - d['mjd'][groups[-1][0]] < MERGE_DAYS: groups[-1].append(i)
            else: groups.append([i])
        grids, mjds, members = [], [], []
        for gi in groups:
            gg = np.nanmean([grid_of(i) for i in gi], 0)
            f = np.isfinite(gg); _, med, _ = sigma_clipped_stats(gg[f], sigma=3)
            grids.append(gg - med); mjds.append(float(np.mean(d['mjd'][gi]))); members.append([int(d['epochs'][i]) for i in gi])
        p10 = np.median([np.nanpercentile(x, 10) for x in grids]); p995 = np.median([np.nanpercentile(x, 99.5) for x in grids])
        frames = []
        yy, xx = np.mgrid[0:NPIX, 0:NPIX]
        for k, (gg, m) in enumerate(zip(grids, mjds)):
            ra, dec = position_at(c0, m); x, y = (float(q) for q in g.wcs_world2pix(ra, dec, 0))
            # hollow saturated cores: unWISE leaves the saturated centre of very bright stars near zero or negative.
            near = np.hypot(xx - x, yy - y) <= 2.5
            from scipy.ndimage import generic_filter
            g0 = np.where(np.isfinite(gg), gg, 0.0)
            nbmed = generic_filter(g0, lambda v: np.median(np.delete(v, 4)), size=3, mode='constant')
            sat = near & (nbmed > 0.3 * p995) & (g0 < 0.4 * nbmed)     # a dark cell surrounded by saturated-bright cells
            rr = np.hypot(xx - x, yy - y); ring = (rr >= 2.5) & (rr <= 4.0) & np.isfinite(gg)
            ringmed = float(np.median(gg[ring])) if ring.sum() >= 8 else -np.inf
            if ringmed > 0.2 * p995: sat |= (rr <= 2.5) & (g0 < 0.5 * ringmed)   # hollow core larger than one cell (R Dra)
            peak = float(np.nanmax(np.where(near | ring, gg, np.nan)))
            mask = ~np.isfinite(gg) | sat
            disp = np.where(sat, peak, gg)          # drawn white: saturated means brightest, not empty
            save_png(asinh8(disp, p10, p995, 0.1), f"{od}/{key}/f{k:02d}.png")
            save_png((sat * 255).astype(np.uint8), f"{od}/{key}/m{k:02d}.png")
            fit = gauss_fit(gg, x, y, rfit=4.0, bad=mask)
            off = None if not fit else float(np.hypot(fit['x'] - x, fit['y'] - y))
            use = fit is not None and off <= 1.5
            cx, cy = (fit['x'], fit['y']) if use else (x, y)
            frames.append(dict(i=k, kind='unwise', survey='unWISE time-resolved coadd' + (' (2010 cryogenic WISE)' if m < 55600 else ' (NEOWISE-R)'),
                               mjd=r(m, 3), date=Time(m, format='mjd').isot[:10], unwise_epochs=members[k], path=f"timelapse/{key}/f{k:02d}.png",
                               pred=dict(png_x=r(x), png_y=r(NPIX - 1 - y)), centroid=dict(png_x=r(cx), png_y=r(NPIX - 1 - cy), source='fit' if use else 'prediction'),
                               fit_offset_px=r(off, 2) if off is not None else None, saturated_core_px=int(sat.sum())))
        # SPHEREx epoch from the long-baseline bundle
        p = lb['pairs'].get(key)
        if p and p.get('usable'):
            k = len(frames); src = f"{OUTROOT}/{tid}/" + p["paths"]["spherex"]
            sxi = np.array(Image.open(src)); sxm = np.array(Image.open(src.replace('spherex.png', 'spherex_mask.png'))) > 0
            # masked SPHEREx core pixels near the target (saturation) drawn white, like the unWISE frames
            sp0 = p['spherex_px']; from scipy.ndimage import label as cclabel
            lab, _ = cclabel(sxm); ids = set(lab[np.hypot(xx - sp0['png_x'], yy - sp0['png_y']) <= 2.5].ravel()) - {0}
            core = np.isin(lab, list(ids)) & (np.hypot(xx - sp0['png_x'], yy - sp0['png_y']) <= 8)
            Image.fromarray(np.where(core, 255, sxi).astype(np.uint8), mode='L').save(f"{od}/{key}/f{k:02d}.png", optimize=True)
            Image.fromarray((core * 255).astype(np.uint8), mode='L').save(f"{od}/{key}/m{k:02d}.png", optimize=True)
            fs = p['fit'].get('spherex'); off = fs.get('offset_from_pred_px') if fs else None; use = fs is not None and off is not None and off <= 1.5
            sp = p['spherex_px']
            frames.append(dict(i=k, kind='spherex', survey=p['spherex_label'], mjd=p['spherex_mjd_mean'], date=Time(p['spherex_mjd_mean'], format='mjd').isot[:10],
                               date_range=[p['spherex_date_start'], p['spherex_date_end']], path=f"timelapse/{key}/f{k:02d}.png",
                               pred=dict(png_x=sp['png_x'], png_y=sp['png_y']),
                               centroid=dict(png_x=r(fs['x']) if use else sp['png_x'], png_y=r(NPIX - 1 - fs['y']) if use else sp['png_y'], source='fit' if use else 'prediction'),
                               fit_offset_px=off, saturated_core_px=int(core.sum()), stretch='own (MJy/sr)'))
        out['bands'][key] = dict(n_frames=len(frames), n_unwise=len(grids), stretch=dict(lo=r(p10, 2), hi=r(p995, 2), a=0.1, unit='unWISE counts (Vega nanomaggies), local-median-subtracted',
                                 type='one asinh stretch for all unWISE frames: median over epochs of each frame\'s 10th and 99.5th percentile'),
                                 cutout_centre_deg=cut_centre, gap_filled_from_neighbour_tile=bool(alts), orientation_check=dict(corr_vs_allsky_2010=r(cc_ok, 3), corr_if_flipped=r(cc_flip, 3)), frames=frames)
        all_mjd += [f['mjd'] for f in frames]
    m0, m1 = min(all_mjd), max(all_mjd); track = []
    for m in np.arange(m0, m1 + 30, 30.0):
        ra, dec = position_at(c0, min(m, m1)); x, y = (float(q) for q in g.wcs_world2pix(ra, dec, 0))
        track.append([r(min(m, m1), 1), r(x, 2), r(NPIX - 1 - y, 2)])
    out['track'] = dict(step_days=30, columns=['mjd', 'png_x', 'png_y'], points=track, source=lb['motion']['source'])
    json.dump(out, open(f"{od}/timelapse.json", 'w'), indent=1)
    for key, bd in out['bands'].items():
        fo = [f['fit_offset_px'] for f in bd['frames']]
        print(tid, key, 'sat', [f['saturated_core_px'] for f in bd['frames']], bd['n_frames'], bd['frames'][0]['date'], bd['frames'][-1]['date'], bd['orientation_check'], 'fits<=1.5:', sum(1 for f in bd['frames'] if f['centroid']['source'] == 'fit'), 'offs', [None if v is None else round(v, 1) for v in fo])

if __name__ == '__main__':
    for t in (sys.argv[1:] or T): main(t)
