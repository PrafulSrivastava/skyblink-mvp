"""Long-baseline blink: WISE All-Sky (2010, cryogenic) W1/W2 vs SPHEREx (2025-26) on one shared grid.

For each target:
 1. Propagate the catalogue position (Gaia DR3 / CatWISE2020) to the WISE epoch, found as the mean MJD
    of the WISE L1b frames that cover that position (IRSA IBE, wise/allsky/4band_p1bm_frm).
 2. Cut out the WISE All-Sky Atlas W1 and W2 intensity images (IRSA IBE, wise/allsky/4band_p3am_cdd).
 3. Choose the latest SPHEREx visit with >=3 frames in the matching wavelength window
    (W1 3.4 um <-> SPHEREx 2.9-3.8 um, D4; W2 4.6 um <-> SPHEREx 4.0-5.0 um, D5/D6).
 4. Build a 49x49, 6.15"/px TAN grid (the SPHEREx bundle's scale and field) centred on the midpoint
    between the WISE-epoch and SPHEREx-epoch positions, so both positions fit even for Barnard's Star (~2.7').
 5. WISE: flux-conserving block mean of the native 1.375" pixels into the grid cells, local-median subtracted.
    SPHEREx: reprojected from the cached native strips exactly as stage3 does, median co-add.
 6. Brightness normalisation: each image gets its own asinh stretch between its 10th and 99.5th percentile
    (the units differ: WISE DN vs SPHEREx MJy/sr), so the field stars look alike.
 7. Measure the target with a 2D Gaussian at both predicted positions and record everything in longbaseline.json.
"""
import sys, os, io, glob, json, requests, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from stage3 import *          # load_frame, reproject_frame, grid_wcs, asinh8, save_png, gauss_fit, NPIX, SCALE ...
from astropy.io import fits
from astropy.wcs import WCS
from astropy.table import Table
from astropy.time import Time
from astropy.coordinates import SkyCoord
import astropy.units as u

IBE = "https://irsa.ipac.caltech.edu/ibe"
CACHE = os.path.join(os.path.dirname(__file__), "lbcache")
OUTROOT = "/workspace/skyblink-data"
PAIRS = {"W1": dict(wise_um=3.4, wl=(2.9, 3.8), dets=(4,), label="SPHEREx 2.9-3.8 \u00b5m (D4)"),
         "W2": dict(wise_um=4.6, wl=(4.0, 5.0), dets=(5, 6), label="SPHEREx 4.0-5.0 \u00b5m (D5/D6)")}
S = requests.Session()

def get(url, **kw):
    for k in range(4):
        try:
            r = S.get(url, timeout=180, **kw)
            if r.status_code == 200: return r
        except Exception as e: err = e
    raise IOError(url)

def csv(url):
    t = Table.read(get(url).text, format='ascii.csv')
    return t

def wise_epoch(ra, dec):
    t = csv(f"{IBE}/search/wise/allsky/4band_p1bm_frm?POS={ra},{dec}&ct=csv&where=band%3D1")
    good = t[t['qual_frame'] > 0] if len(t) else t
    m = np.array(good['mjd_obs'], float)
    return float(m.mean()), float(m.min()), float(m.max()), len(m)

def wise_cutout(ra, dec, band, tid):
    p = f"{CACHE}/{tid}_w{band}.fits"
    if not os.path.exists(p):
        t = csv(f"{IBE}/search/wise/allsky/4band_p3am_cdd?POS={ra},{dec}&INTERSECT=CENTER&mcen&ct=csv&where=band%3D{band}")
        cid = str(t['coadd_id'][0])
        url = f"{IBE}/data/wise/allsky/4band_p3am_cdd/{cid[:2]}/{cid[:4]}/{cid}/{cid}-w{band}-int-3.fits?center={ra},{dec}&size=480arcsec"
        open(p, 'wb').write(get(url).content)
    h = fits.open(p)
    return h[0].data.astype(float), h[0].header

def bin_to_grid(img, hdr, g):
    w = WCS(hdr)
    ny, nx = img.shape
    yy, xx = np.mgrid[0:ny, 0:nx]
    ra, dec = w.wcs_pix2world(xx.ravel(), yy.ravel(), 0)
    gx, gy = g.wcs_world2pix(ra, dec, 0)
    ix, iy = np.round(gx).astype(int), np.round(gy).astype(int)
    v = img.ravel()
    ok = (ix >= 0) & (ix < NPIX) & (iy >= 0) & (iy < NPIX)
    fin = ok & np.isfinite(v)
    s = np.zeros((NPIX, NPIX)); n = np.zeros((NPIX, NPIX)); ntot = np.zeros((NPIX, NPIX))
    np.add.at(s, (iy[fin], ix[fin]), v[fin]); np.add.at(n, (iy[fin], ix[fin]), 1); np.add.at(ntot, (iy[ok], ix[ok]), 1)
    with np.errstate(all='ignore'):
        out = np.where(n >= 0.5 * np.maximum(ntot, 1), s / n, np.nan)
    out[ntot == 0] = np.nan
    nanfrac = np.where(ntot > 0, 1 - n / np.maximum(ntot, 1), 1.0)
    return out, nanfrac

def stretch(a):
    f = a[np.isfinite(a)]
    lo, hi = float(np.percentile(f, 10)), float(np.percentile(f, 99.5))
    if hi <= lo: hi = lo + 1e-3
    return lo, hi

def r(v, n=3):
    return None if v is None or not np.isfinite(v) else round(float(v), n)

def main(tid):
    cat = json.load(open(os.path.join(os.path.dirname(__file__), 'meta/catalog.json')))[tid]; c0 = star_coord(cat)
    tj = json.load(open(f"{OUTROOT}/{tid}/target.json"))
    # 1. WISE epoch
    ra0, dec0 = position_at(c0, 55350.0)
    mjd_w, mjd_w0, mjd_w1, nfr = wise_epoch(ra0, dec0)
    ra_w, dec_w = position_at(c0, mjd_w)
    # SPHEREx frames
    sia = Table.read(f"meta/sia_{tid}.ecsv"); sia_by = {(x['obs_id'], x['energy_bandpassname'][-2:]): x for x in sia}
    frames = []
    for p in sorted(glob.glob(f"cache/{tid}/*.npz")):
        oid, b = os.path.basename(p)[:-4].rsplit('_', 1)
        f = load_frame(p, sia_by[(oid, b)], c0)
        if not (0 <= f['x'] <= 2039 and 0 <= f['y'] <= 2039): continue
        if not np.isfinite(f['wl']): continue
        frames.append(f)
    # visit labels from target.json (by mjd range)
    def visit_of(m):
        for v in tj['visits']:
            if v['mjd_min'] - 1e-4 <= m <= v['mjd_max'] + 1e-4: return v['id']
    for f in frames: f['visit'] = visit_of(f['mjd'])
    out = dict(id=tid, name=tj['name'], wise=dict(survey="WISE All-Sky Atlas (cryogenic, 4-band)", mjd_mean=r(mjd_w, 4), mjd_min=r(mjd_w0, 4), mjd_max=r(mjd_w1, 4),
               date=Time(mjd_w, format='mjd').isot[:10], date_start=Time(mjd_w0, format='mjd').isot[:10], date_end=Time(mjd_w1, format='mjd').isot[:10], n_l1b_frames_w1=nfr,
               target_radec=[r(ra_w, 7), r(dec_w, 7)]), pairs={})
    # pick SPHEREx visit per pair, then one shared grid: centre on midpoint using the W1-pair visit (fallback W2)
    pick = {}
    for key, P in PAIRS.items():
        sel = [f for f in frames if f['det'] in P['dets'] and P['wl'][0] <= f['wl'] <= P['wl'][1] and f['visit']]
        byv = {}
        for f in sel: byv.setdefault(f['visit'], []).append(f)
        cands = [v for v in sorted(byv, key=lambda v: np.mean([f['mjd'] for f in byv[v]])) if len(byv[v]) >= 3]
        if not cands and byv: cands = [max(byv, key=lambda v: len(byv[v]))]
        if cands: pick[key] = byv[cands[-1]]
    mjds = [np.mean([f['mjd'] for f in pick[k]]) for k in pick]
    mjd_s = float(np.mean(mjds))
    ra_s, dec_s = position_at(c0, mjd_s)
    cw, cs = SkyCoord(ra_w * u.deg, dec_w * u.deg), SkyCoord(ra_s * u.deg, dec_s * u.deg)
    pa = cw.position_angle(cs); sep = cw.separation(cs)
    mid = cw.directional_offset_by(pa, sep / 2)
    g = grid_wcs(mid.ra.deg, mid.dec.deg)
    out['grid'] = dict(NAXIS1=NPIX, NAXIS2=NPIX, CTYPE1='RA---TAN', CTYPE2='DEC--TAN', CRVAL1=r(mid.ra.deg, 8), CRVAL2=r(mid.dec.deg, 8),
                       CDELT1=-SCALE / 3600, CDELT2=SCALE / 3600, CRPIX1=(NPIX + 1) / 2, CRPIX2=(NPIX + 1) / 2, RADESYS='ICRS', pixel_scale_arcsec=SCALE,
                       orientation='north up, east left', centre='midpoint between the WISE-epoch and SPHEREx-epoch positions')
    dyr = (mjd_s - mjd_w) / 365.25
    out['motion'] = dict(baseline_years=r(dyr, 2), expected_shift_arcsec=r(sep.arcsec, 1), expected_shift_px=r(sep.arcsec / SCALE, 2),
                         position_angle_deg=r(pa.deg, 1), pm_total_mas_yr=r(float(np.hypot(cat['pmra'], cat['pmdec'])), 1),
                         source=f"{cat['catalog']} pmra*cosdec={cat['pmra']:.1f}, pmdec={cat['pmdec']:.1f} mas/yr" + (f", parallax {cat['parallax']:.1f} mas" if cat.get('parallax') else ''))
    od = f"{OUTROOT}/{tid}/longbaseline"
    for key, P in PAIRS.items():
        if key not in pick: out['pairs'][key] = dict(usable=False, reason='no SPHEREx frames in the matching wavelength window'); continue
        fs = pick[key]; v = fs[0]['visit']; ms = np.array([f['mjd'] for f in fs])
        stk, sm, cov = [], [], []
        for f in fs:
            rr = reproject_frame(f, g)
            if rr is None: continue
            stk.append(rr[0]); sm.append(rr[1]); cov.append(rr[3])
        with np.errstate(all='ignore'):
            sx = np.nanmedian(np.array(stk), 0); satf = np.array(sm).sum(0) / np.maximum(np.array(cov).sum(0), 1)
        sxmask = (~np.isfinite(sx)) | (satf >= 0.5)
        wimg, wh = wise_cutout(ra_w, dec_w, int(key[1]), tid)
        wg, nanfrac = bin_to_grid(wimg, wh, g)
        fin = np.isfinite(wg)
        if fin.sum() < 100: out['pairs'][key] = dict(usable=False, reason='WISE cutout has too little valid data'); continue
        _, med, _ = sigma_clipped_stats(wg[fin], sigma=3); wg = wg - med
        wmask = (~np.isfinite(wg)) | (nanfrac >= 0.5)
        # stretches
        slo, shi = stretch(sx); wlo, whi = stretch(wg)
        save_png(asinh8(wg, wlo, whi, 0.1), f"{od}/{key}/wise.png")
        save_png(asinh8(sx, slo, shi, 0.1), f"{od}/{key}/spherex.png")
        save_png((wmask * 255).astype(np.uint8), f"{od}/{key}/wise_mask.png")
        save_png((sxmask * 255).astype(np.uint8), f"{od}/{key}/spherex_mask.png")
        mv = float(ms.mean())
        rs, ds = position_at(c0, mv)
        xw, yw = (float(q) for q in g.wcs_world2pix(ra_w, dec_w, 0)); xs, ys = (float(q) for q in g.wcs_world2pix(rs, ds, 0))
        fw = gauss_fit(np.where(np.isfinite(wg), wg, np.nan), xw, yw, rfit=4.0, bad=wmask)
        fsx = gauss_fit(np.where(np.isfinite(sx), sx, np.nan), xs, ys, rfit=4.0, bad=sxmask)
        def nm(m, x, y, rad=3):
            yy, xx = np.mgrid[0:NPIX, 0:NPIX]; return int((m & (np.hypot(xx - x, yy - y) <= rad)).sum())
        # S/N proxy: peak over background sigma
        def snr(a, x, y, m):
            yy, xx = np.mgrid[0:NPIX, 0:NPIX]; d = np.hypot(xx - x, yy - y)
            ann = (d >= 6) & (d <= 12) & np.isfinite(a) & ~m; core = (d <= 1.5) & np.isfinite(a) & ~m
            if core.sum() == 0 or ann.sum() < 20: return None
            _, mb, sb = sigma_clipped_stats(a[ann], sigma=3)
            return float((a[core].max() - mb) / sb) if sb > 0 else None
        out['pairs'][key] = dict(usable=True, wise_band=key, wise_um=P['wise_um'], spherex_label=P['label'], spherex_window_um=list(P['wl']),
            spherex_visit=v, spherex_n_frames=len(stk), spherex_mjd_mean=r(mv, 4), spherex_date_start=Time(ms.min(), format='mjd').isot[:10],
            spherex_date_end=Time(ms.max(), format='mjd').isot[:10], spherex_wl_um=[r(min(f['wl'] for f in fs), 3), r(max(f['wl'] for f in fs), 3)],
            wise_px=dict(x=r(xw), y=r(yw), png_x=r(xw), png_y=r(NPIX - 1 - yw)), spherex_px=dict(x=r(xs), y=r(ys), png_x=r(xs), png_y=r(NPIX - 1 - ys)),
            shift_arcsec=r(SkyCoord(ra_w * u.deg, dec_w * u.deg).separation(SkyCoord(rs * u.deg, ds * u.deg)).arcsec, 1),
            masked_px_within_3px=dict(wise=nm(wmask, xw, yw), spherex=nm(sxmask, xs, ys)),
            snr_peak=dict(wise=r(snr(wg, xw, yw, wmask), 1), spherex=r(snr(sx, xs, ys, sxmask), 1)),
            fit=dict(wise=fw, spherex=fsx),
            stretch=dict(wise=dict(lo=wlo, hi=whi, unit='WISE DN (local-median-subtracted)'), spherex=dict(lo=slo, hi=shi, unit='MJy/sr (local-median-subtracted)'), a=0.1, type='asinh, own 10th-99.5th percentile per image'),
            paths=dict(wise=f"longbaseline/{key}/wise.png", spherex=f"longbaseline/{key}/spherex.png", wise_mask=f"longbaseline/{key}/wise_mask.png", spherex_mask=f"longbaseline/{key}/spherex_mask.png"))
        for k2 in ('wise', 'spherex'):
            fdat = out['pairs'][key]['fit'][k2]
            if not fdat: continue
            px = out['pairs'][key][f'{k2}_px']
            fdat['offset_from_pred_px'] = r(float(np.hypot(fdat['x'] - px['x'], fdat['y'] - px['y'])), 2)
    os.makedirs(od, exist_ok=True)
    json.dump(out, open(f"{od}/longbaseline.json", 'w'), indent=1, default=lambda o: o.item() if hasattr(o, 'item') else str(o))
    print(tid, json.dumps(dict(wise=out['wise']['date'], motion=out['motion'], pairs={k: {q: out['pairs'][k].get(q) for q in ('usable', 'spherex_visit', 'spherex_n_frames', 'shift_arcsec', 'snr_peak', 'masked_px_within_3px')} | ({'fit_off': {z: (out['pairs'][k]['fit'][z] or {}).get('offset_from_pred_px') for z in ('wise', 'spherex')}} if out['pairs'][k].get('usable') else {}) for k in out['pairs']})))

if __name__ == '__main__':
    for t in (sys.argv[1:] or list(TARGETS)):
        main(t)
