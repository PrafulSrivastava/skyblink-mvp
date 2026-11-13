from common import *
import io, os, sys, glob, pyvo, logging
logging.getLogger('astropy').setLevel(logging.ERROR)
from astropy.io import fits
from astropy.wcs import WCS
from astropy.table import Table
from astropy.stats import sigma_clipped_stats
from scipy.ndimage import map_coordinates
from scipy.optimize import least_squares
from PIL import Image

OUT = "/workspace/skyblink-data"
NPIX = 49; SCALE = 6.15  # arcsec/px
R_AP = 2.5; R_IN = 6.0; R_OUT = 10.0
BITS = dict(TRANSIENT=0, OVERFLOW=1, SUR_ERROR=2, NONFUNC=6, DICHROIC=7, MISSING_DATA=9, HOT=10, COLD=11, FULLSAMPLE=12, PHANMISS=14,
            NONLINEAR=15, PERSIST=17, OUTLIER=19, CROSSTALK=20, SOURCE=21, GHOST=22, GHOST_FPA=23, GHOST_EXT=24, STREAK=25, BLOOM=26, SNOWBALL=27, HALO=28)
SAT_NAMES = ['OVERFLOW', 'NONLINEAR']
FLAG_NAMES = ['SUR_ERROR', 'TRANSIENT', 'NONFUNC', 'DICHROIC', 'MISSING_DATA', 'HOT', 'COLD', 'PHANMISS', 'PERSIST', 'OUTLIER', 'CROSSTALK', 'GHOST', 'GHOST_FPA', 'GHOST_EXT', 'STREAK', 'BLOOM', 'SNOWBALL', 'HALO']
SAT_MASK = sum(1 << BITS[n] for n in SAT_NAMES)
FLAG_MASK = sum(1 << BITS[n] for n in FLAG_NAMES)
BAD_MASK = SAT_MASK | FLAG_MASK
CH = np.array([float(x) for x in "0.753 0.771 0.790 0.809 0.828 0.848 0.868 0.889 0.910 0.932 0.955 0.978 1.001 1.025 1.050 1.075 1.102 1.113 1.139 1.167 1.195 1.224 1.254 1.284 1.315 1.346 1.378 1.412 1.446 1.481 1.517 1.554 1.592 1.631 1.656 1.695 1.735 1.775 1.818 1.861 1.905 1.949 1.995 2.041 2.089 2.139 2.189 2.240 2.292 2.345 2.399 2.445 2.506 2.575 2.646 2.719 2.794 2.871 2.951 3.033 3.118 3.204 3.293 3.383 3.476 3.570 3.667 3.768 3.833 3.867 3.901 3.935 3.970 4.005 4.040 4.076 4.112 4.148 4.184 4.220 4.257 4.294 4.331 4.368 4.405 4.435 4.467 4.500 4.533 4.566 4.600 4.635 4.669 4.704 4.739 4.773 4.808 4.843 4.879 4.915 4.951 4.988".split()])
ARCSEC2_SR = (np.pi / 180 / 3600) ** 2
PRIM = fits.PrimaryHDU().header.tostring().encode() if False else None

def prim_block():
    h = fits.Header(); h['SIMPLE'] = True; h['BITPIX'] = 8; h['NAXIS'] = 0; h['EXTEND'] = True
    s = h.tostring(); return s.encode() if isinstance(s, str) else s
PB = prim_block()

def enclosed_fraction(epsf, r_native, ovs=5):
    p = np.clip(np.nan_to_num(epsf), 0, None)
    n = p.shape[0]; sub = 4
    yy, xx = np.mgrid[0:n * sub, 0:n * sub]; xx = (xx + 0.5) / sub - 0.5; yy = (yy + 0.5) / sub - 0.5
    tot = p.sum()
    cy, cx = (p * np.mgrid[0:n, 0:n][0]).sum() / tot, (p * np.mgrid[0:n, 0:n][1]).sum() / tot
    inside = ((xx - cx) ** 2 + (yy - cy) ** 2) <= (r_native * ovs) ** 2
    frac = inside.reshape(n, sub, n, sub).mean((1, 3))
    return float((p * frac).sum() / tot)

def pixel_area_arcsec2(w, x, y):
    p = w.all_pix2world([[x - .5, y - .5], [x + .5, y - .5], [x - .5, y + .5]], 0)
    dec0 = np.radians(p[0, 1])
    v1 = np.array([(p[1, 0] - p[0, 0]) * np.cos(dec0), p[1, 1] - p[0, 1]]) * 3600
    v2 = np.array([(p[2, 0] - p[0, 0]) * np.cos(dec0), p[2, 1] - p[0, 1]]) * 3600
    return abs(v1[0] * v2[1] - v1[1] * v2[0])

def aperture_weights(shape, xc, yc, r, sub=5):
    ny, nx = shape
    yy, xx = np.mgrid[0:ny * sub, 0:nx * sub]
    xx = (xx + 0.5) / sub - 0.5; yy = (yy + 0.5) / sub - 0.5
    m = ((xx - xc) ** 2 + (yy - yc) ** 2) <= r * r
    return m.reshape(ny, sub, nx, sub).mean((1, 3))

def load_frame(path, sia_row, c0):
    d = np.load(path, allow_pickle=False)
    hs = d['header'].item() if d['header'].dtype.kind in 'SU' else d['header']
    hs = hs.decode() if isinstance(hs, bytes) else str(hs)
    hdr = fits.Header.fromstring(hs)
    w = WCS(hdr)
    wave = fits.open(io.BytesIO(PB + d['wave'].tobytes()))
    hl = fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(header=hdr), wave[1]])
    sw = WCS(hdr, fobj=hl, key='W'); sw.sip = None
    mjd = float(hdr['MJD-AVG']); det = int(hdr['DETECTOR'])
    ra, dec = position_at(c0, mjd)
    x, y = (float(v) for v in w.all_world2pix(ra, dec, 0))
    wl, bw = (float(v) for v in sw.pixel_to_world_values(x, y))
    x0, y0 = int(d['x0']), int(d['y0'])
    wl_ = w.deepcopy(); wl_.wcs.crpix = [w.wcs.crpix[0] - x0, w.wcs.crpix[1] - y0]
    return dict(img=d['img'], var=d['var'], flags=d['flags'], x0=x0, y0=y0, w=w, wloc=wl_, mjd=mjd, det=det, ra=ra, dec=dec, x=x, y=y,
                xl=x - x0, yl=y - y0, wl=wl, bw=bw, epsf=d['epsf'], epsf_meta=json.loads(str(d['epsf_meta'])), obs_id=str(d['obs_id']),
                collection=str(d['collection']), omega_hdr=float(hdr.get('OMEGA_MEDIAN', np.nan)), psf_fwhm=float(hdr.get('PSF_FWHM', np.nan)),
                em_min=float(sia_row['em_min']) * 1e6, em_max=float(sia_row['em_max']) * 1e6)

def photometry(f):
    img, var, fl = f['img'], f['var'], f['flags']
    ny, nx = img.shape; xc, yc = f['xl'], f['yl']
    if not (R_OUT < xc < nx - 1 - R_OUT and R_OUT < yc < ny - 1 - R_OUT):
        return None  # too close to strip/detector edge for annulus
    wap = aperture_weights(img.shape, xc, yc, R_AP)
    inap = wap > 0
    yy, xx = np.mgrid[0:ny, 0:nx]; rr = np.hypot(xx - xc, yy - yc)
    sat = bool(((fl[inap] & SAT_MASK) != 0).any())
    flagged = bool(((fl[inap] & FLAG_MASK) != 0).any())
    nan_in = bool((~np.isfinite(img[inap])).any())
    ann = (rr >= R_IN) & (rr <= R_OUT) & np.isfinite(img) & ((fl & BAD_MASK) == 0)
    if ann.sum() < 20: return dict(flux=None, flux_err=None, saturated=sat, flagged=True, note='annulus<20 good px')
    _, bkg, sig = sigma_clipped_stats(img[ann], sigma=3)
    nann = int(ann.sum())
    area = pixel_area_arcsec2(f['w'], f['x'], f['y'])
    if f['epsf'].size:
        enc = enclosed_fraction(f['epsf'], R_AP, f['epsf_meta'].get('ovs', 5))
    else:
        enc = None
    res = dict(saturated=sat, flagged=flagged or nan_in, bkg=float(bkg), pix_area_arcsec2=area, enc=enc)
    if sat or nan_in or enc is None:
        res.update(flux=None, flux_err=None); return res
    nap = wap.sum()
    s = float((wap[inap] * (img[inap] - bkg)).sum())
    v = float((wap[inap] ** 2 * np.where(np.isfinite(var[inap]), var[inap], 0)).sum()) + nap ** 2 * sig ** 2 * (np.pi / 2) / nann
    conv = area * ARCSEC2_SR * 1e12 / enc  # MJy/sr * px -> uJy, aperture-corrected
    res.update(flux=s * conv, flux_err=np.sqrt(v) * conv)
    return res

def grid_wcs(ra, dec):
    g = WCS(naxis=2); g.wcs.ctype = ['RA---TAN', 'DEC--TAN']; g.wcs.crval = [ra, dec]
    g.wcs.cdelt = [-SCALE / 3600, SCALE / 3600]; g.wcs.crpix = [(NPIX + 1) / 2, (NPIX + 1) / 2]; g.wcs.cunit = ['deg', 'deg']
    g.wcs.radesys = 'ICRS'; g.wcs.equinox = 2000.0
    return g

def reproject_frame(f, g):
    img = f['img']; fl = f['flags']
    good = np.isfinite(img) & ((fl & BAD_MASK) == 0)
    if good.sum() < 50: return None
    _, med, _ = sigma_clipped_stats(img[good], sigma=3)
    filled = np.where(good, img - med, 0.0)
    yy, xx = np.mgrid[0:NPIX, 0:NPIX]
    ra, dec = g.wcs_pix2world(xx, yy, 0)
    px, py = f['w'].all_world2pix(ra, dec, 0)
    px = px - f['x0']; py = py - f['y0']
    inside = (px >= 0) & (px <= img.shape[1] - 1) & (py >= 0) & (py <= img.shape[0] - 1)
    v = map_coordinates(filled, [py, px], order=1, mode='constant', cval=0)
    wgt = map_coordinates(good.astype(float), [py, px], order=1, mode='constant', cval=0)
    out = np.where(inside & (wgt >= 0.5), v / np.maximum(wgt, 1e-6), np.nan)
    satm = map_coordinates(((fl & SAT_MASK) != 0) | ~np.isfinite(img), [py, px], order=0, mode='constant', cval=0).astype(bool)
    badm = map_coordinates(((fl & BAD_MASK) != 0) | ~np.isfinite(img), [py, px], order=0, mode='constant', cval=0).astype(bool)
    return out.astype(np.float32), satm & inside, badm & inside, inside

def asinh8(v, lo, hi, a):
    x = (v - lo) / (hi - lo)
    y = np.arcsinh(np.clip(x, 0, None) / a) / np.arcsinh(1 / a)
    return np.where(np.isfinite(v), np.clip(np.round(y * 255), 0, 255), 0).astype(np.uint8)

def div8(d, s, a):
    y = np.arcsinh(d / (s * a)) / np.arcsinh(1 / a)
    return np.where(np.isfinite(d), np.clip(np.round(128 + 127 * np.clip(y, -1, 1)), 1, 255), 128).astype(np.uint8)

def save_png(arr, path):  # arr in FITS orientation (row 0 = south); write north-up
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(np.flipud(arr), mode='L').save(path, optimize=True)

def save_f32(arr, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    np.flipud(arr).astype('<f4').tofile(path)

def gauss_fit(img, x0, y0, rfit=5.0, bad=None):
    ny, nx = img.shape; yy, xx = np.mgrid[0:ny, 0:nx]
    m = (np.hypot(xx - x0, yy - y0) <= rfit) & np.isfinite(img)
    if bad is not None: m &= ~bad
    if m.sum() < 8: return None
    X, Y, Z = xx[m], yy[m], img[m]
    def model(p): return p[0] * np.exp(-((X - p[1]) ** 2 + (Y - p[2]) ** 2) / (2 * p[3] ** 2)) + p[4]
    p0 = [max(np.nanmax(Z), 1e-3), x0, y0, 0.8, np.nanmedian(img[np.isfinite(img)])]
    try:
        r = least_squares(lambda p: model(p) - Z, p0, bounds=([0, x0 - 3, y0 - 3, 0.3, -np.inf], [np.inf, x0 + 3, y0 + 3, 4, np.inf]))
    except Exception: return None
    J = r.jac; cov = None
    try:
        dof = max(1, len(Z) - 5); s2 = (r.fun ** 2).sum() / dof; cov = np.linalg.inv(J.T @ J) * s2
        ex, ey = float(np.sqrt(cov[1, 1])), float(np.sqrt(cov[2, 2]))
    except Exception: ex = ey = None
    return dict(x=float(r.x[1]), y=float(r.x[2]), sigma=float(r.x[3]), amp=float(r.x[0]), ex=ex, ey=ey, npix=int(m.sum()), n_masked_in_r=int(((np.hypot(xx - x0, yy - y0) <= rfit) & ~m).sum()))

def r6(v, n=6):
    return None if v is None or (isinstance(v, float) and not np.isfinite(v)) else round(float(v), n)

def main(tid):
    T = TARGETS[tid]; cat = json.load(open('meta/catalog.json'))[tid]; c0 = star_coord(cat)
    sia = Table.read(f"meta/sia_{tid}.ecsv"); sia_by = {(r['obs_id'], r['energy_bandpassname'][-2:]): r for r in sia}
    frames = []; rej = dict(wl_out_of_band=0, offdetector=0)
    for p in sorted(glob.glob(f"cache/{tid}/*.npz")):
        oid, b = os.path.basename(p)[:-4].rsplit('_', 1)
        f = load_frame(p, sia_by[(oid, b)], c0)
        if not (0 <= f['x'] <= 2039 and 0 <= f['y'] <= 2039): rej['offdetector'] += 1; continue
        if not (np.isfinite(f['wl']) and f['em_min'] - 1e-3 <= f['wl'] <= f['em_max'] + 1e-3): rej['wl_out_of_band'] += 1; continue
        f['band'] = f"D{f['det']}"; frames.append(f)
    frames.sort(key=lambda f: f['mjd'])
    # visits
    vid = 0; last = None
    for f in frames:
        if last is not None and f['mjd'] - last > 20: vid += 1
        f['visit_idx'] = vid; last = f['mjd']
    nv = vid + 1
    visits = []
    for k in range(nv):
        fs = [f for f in frames if f['visit_idx'] == k]
        mj = np.array([f['mjd'] for f in fs])
        nb = {f"D{d}": sum(1 for f in fs if f['det'] == d) for d in range(1, 7)}
        full = all(nb[b] >= 5 for b in nb)
        vlab = f"v{k + 1}"
        visits.append(dict(id=vlab, mjd_mean=float(mj.mean()), mjd_min=float(mj.min()), mjd_max=float(mj.max()),
            date_start=Time(mj.min(), format='mjd').isot[:10], date_end=Time(mj.max(), format='mjd').isot[:10],
            n_images=len(fs), n_images_per_band=nb, bands_present=[b for b in nb if nb[b] > 0], full=full))
        for f in fs: f['visit'] = vlab
    mjd_all = np.mean([f['mjd'] for f in frames])
    ra_m, dec_m = position_at(c0, mjd_all)
    g = grid_wcs(ra_m, dec_m)
    for v in visits:
        ra, dec = position_at(c0, v['mjd_mean']); x, y = g.wcs_world2pix(ra, dec, 0)
        v['target_radec'] = [r6(ra, 7), r6(dec, 7)]
        v['target_px'] = dict(x=r6(float(x), 3), y=r6(float(y), 3), png_x=r6(float(x), 3), png_y=r6(NPIX - 1 - float(y), 3))
    # input coordinate offset
    ic = SkyCoord(T['input_coord'].split(' (')[0], unit=(u.hourangle, u.deg))
    inp_sep = ic.separation(SkyCoord(ra_m * u.deg, dec_m * u.deg)).arcsec
    # photometry
    pts = []; nophot = 0
    for f in frames:
        ph = photometry(f)
        f['phot'] = ph
        if ph is None: nophot += 1; continue
        ch = int(np.argmin(np.abs(CH[(f['det'] - 1) * 17:(f['det']) * 17] - f['wl']))) + (f['det'] - 1) * 17
        pts.append(dict(wavelength_um=r6(f['wl'], 5), bandwidth_um=r6(f['bw'], 5), flux=r6(ph['flux'], 4), flux_err=r6(ph['flux_err'], 4), mjd=r6(f['mjd'], 6),
                        detector=f['band'], visit=f['visit'], channel=ch, flagged=ph['flagged'], saturated=ph['saturated'], obs_id=f['obs_id'],
                        x_native=r6(f['x'], 3), y_native=r6(f['y'], 3), ap_corr=r6(1 / ph['enc'], 4) if ph.get('enc') else None,
                        pix_area_arcsec2=r6(ph.get('pix_area_arcsec2'), 3)))
    def binned(sel):
        out = []
        for c in range(102):
            ps = [p for p in sel if p['channel'] == c]
            ok = [p for p in ps if p['flux'] is not None and not p['flagged'] and not p['saturated'] and p['flux_err'] and p['flux_err'] > 0]
            e = dict(channel=c, wavelength_um=float(CH[c]), n=len(ok), n_saturated=sum(p['saturated'] for p in ps), n_flagged=sum((p['flagged'] and not p['saturated']) for p in ps), n_total=len(ps))
            if ok:
                wv = np.array([1 / p['flux_err'] ** 2 for p in ok]); fv = np.array([p['flux'] for p in ok])
                e['flux'] = r6(float((wv * fv).sum() / wv.sum()), 4); e['flux_err'] = r6(float(1 / np.sqrt(wv.sum())), 4)
                e['wavelength_mean_um'] = r6(float(np.mean([p['wavelength_um'] for p in ok])), 4)
            else:
                e['flux'] = None; e['flux_err'] = None
            out.append(e)
        return out
    # co-adds
    od = f"{OUT}/{tid}"
    coadd = {}; satfrac = {}; badfrac = {}
    for v in visits:
        for b in v['bands_present']:
            fs = [f for f in frames if f['visit'] == v['id'] and f['band'] == b]
            stk, sm, bm, cov = [], [], [], []
            for f in fs:
                r = reproject_frame(f, g)
                if r is None: continue
                stk.append(r[0]); sm.append(r[1]); bm.append(r[2]); cov.append(r[3])
            if not stk: continue
            stk = np.array(stk); cov = np.array(cov).sum(0)
            with np.errstate(all='ignore'):
                ca = np.nanmedian(stk, 0)
                coadd[(v['id'], b)] = ca.astype(np.float32)
                satfrac[(v['id'], b)] = np.array(sm).sum(0) / np.maximum(cov, 1)
                badfrac[(v['id'], b)] = np.array(bm).sum(0) / np.maximum(cov, 1)
            v.setdefault('n_coadded', {})[b] = len(stk)
    stretch = {}; paths = {}
    full_vis = [v['id'] for v in visits if v['full']]
    for b in [f"D{d}" for d in range(1, 7)]:
        arrs = [coadd[k] for k in coadd if k[1] == b]
        if not arrs: continue
        allv = np.concatenate([a[np.isfinite(a)] for a in arrs])
        lo, hi = float(np.percentile(allv, 10)), float(np.percentile(allv, 99.5))
        if hi <= lo: hi = lo + 1e-3
        stretch[b] = dict(type='asinh', lo=lo, hi=hi, a=0.1, unit='MJy/sr (local-median-subtracted)')
        for v in visits:
            k = (v['id'], b)
            if k not in coadd: continue
            a = coadd[k]
            save_png(asinh8(a, lo, hi, 0.1), f"{od}/frames/{b}/{v['id']}.png")
            save_f32(a, f"{od}/frames/{b}/{v['id']}.f32")
            m = (~np.isfinite(a)) | (badfrac[k] >= 0.5) | (satfrac[k] >= 0.5)
            save_png((m * 255).astype(np.uint8), f"{od}/mask/{b}/{v['id']}.png")
            paths.setdefault(b, {})[v['id']] = dict(png=f"frames/{b}/{v['id']}.png", f32=f"frames/{b}/{v['id']}.f32", mask=f"mask/{b}/{v['id']}.png")
        # diff first vs last full visit
        fv = [x for x in full_vis if (x, b) in coadd]
        if len(fv) >= 2:
            A, B = fv[0], fv[-1]
            dd = coadd[(B, b)] - coadd[(A, b)]
            s = float(np.nanpercentile(np.abs(dd), 99.5)) or 1e-3
            stretch[b]['diff'] = dict(type='asinh_diverging', scale=s, a=0.1, mid=128, pair=[A, B], definition=f"{B} minus {A}")
            save_png(div8(dd, s, 0.1), f"{od}/diff/{b}/{A}_{B}.png")
            paths[b]['diff'] = f"diff/{b}/{A}_{B}.png"
    # comparison star
    svc = pyvo.dal.TAPService("https://gea.esac.esa.int/tap-server/tap")
    rad = (NPIX / 2 - 6) * SCALE / 3600
    gq = svc.search(f"SELECT source_id,ra,dec,pmra,pmdec,parallax,phot_g_mean_mag FROM gaiadr3.gaia_source WHERE 1=CONTAINS(POINT(ra,dec),CIRCLE({ra_m},{dec_m},{rad * 1.42})) AND phot_g_mean_mag<17").to_table()
    comp = None; cands = []
    for gmin, gmax in [(11, 15), (10, 16.5)]:
      if cands: break
      for r in gq:
            if str(r['source_id']) == cat['source_id']: continue
            x, y = g.wcs_world2pix(float(r['ra']), float(r['dec']), 0)
            pm = np.hypot(r['pmra'], r['pmdec']) if not np.ma.is_masked(r['pmra']) else np.nan
            dt = np.hypot(x - (NPIX - 1) / 2, y - (NPIX - 1) / 2)
            if not (6 <= x <= NPIX - 7 and 6 <= y <= NPIX - 7) or dt < 7 or not (pm < 10) or not (gmin <= r['phot_g_mean_mag'] <= gmax): continue
            near = [s for s in gq if s['source_id'] != r['source_id'] and SkyCoord(s['ra'] * u.deg, s['dec'] * u.deg).separation(SkyCoord(r['ra'] * u.deg, r['dec'] * u.deg)).arcsec < 20 and s['phot_g_mean_mag'] < r['phot_g_mean_mag'] + 2.5]
            if near: continue
            cands.append((float(r['phot_g_mean_mag']), r, float(x), float(y), float(pm)))
    cands.sort(key=lambda t: t[0])
    if cands:
        G, r, x, y, pm = cands[0]
        comp = dict(gaia_dr3_source_id=str(r['source_id']), ra=float(r['ra']), dec=float(r['dec']), G=G, pm_total_mas_yr=pm,
                    x=r6(x, 3), y=r6(y, 3), png_x=r6(x, 3), png_y=r6(NPIX - 1 - y, 3),
                    selection=f"Gaia DR3, {gmin}<=G<={gmax}, total PM<10 mas/yr, >=7 px from target, >=6 px from grid edge, no Gaia neighbour with G<G+2.5 within 20 arcsec; brightest passing")
    # checks
    checks = {}
    db = T['default_band']
    if len(full_vis) >= 2:
        A, B = full_vis[0], full_vis[-1]
        va = next(v for v in visits if v['id'] == A); vb = next(v for v in visits if v['id'] == B)
        pred = (vb['target_px']['x'] - va['target_px']['x'], vb['target_px']['y'] - va['target_px']['y'])
        res = dict(pair=[A, B], predicted_dx_px=r6(pred[0], 3), predicted_dy_px=r6(pred[1], 3), predicted_shift_px=r6(np.hypot(*pred), 3), per_band={})
        for b in [f"D{d}" for d in range(1, 7)]:
            if (A, b) not in coadd or (B, b) not in coadd: continue
            bad_a = (satfrac[(A, b)] >= 0.5) | (badfrac[(A, b)] >= 0.5); bad_b = (satfrac[(B, b)] >= 0.5) | (badfrac[(B, b)] >= 0.5)
            fa = gauss_fit(coadd[(A, b)], va['target_px']['x'], va['target_px']['y'], bad=bad_a)
            fb = gauss_fit(coadd[(B, b)], vb['target_px']['x'], vb['target_px']['y'], bad=bad_b)
            e = dict(fit_A=fa, fit_B=fb)
            if fa and fb:
                e['measured_dx_px'] = r6(fb['x'] - fa['x'], 3); e['measured_dy_px'] = r6(fb['y'] - fa['y'], 3)
                e['measured_shift_px'] = r6(np.hypot(fb['x'] - fa['x'], fb['y'] - fa['y']), 3)
                e['offset_from_pred_A_px'] = r6(np.hypot(fa['x'] - va['target_px']['x'], fa['y'] - va['target_px']['y']), 3)
                e['offset_from_pred_B_px'] = r6(np.hypot(fb['x'] - vb['target_px']['x'], fb['y'] - vb['target_px']['y']), 3)
            if comp:
                ca_ = gauss_fit(coadd[(A, b)], comp['x'], comp['y'], rfit=3.5, bad=bad_a); cb_ = gauss_fit(coadd[(B, b)], comp['x'], comp['y'], rfit=3.5, bad=bad_b)
                if ca_ and cb_:
                    e['comparison_shift_px'] = r6(np.hypot(cb_['x'] - ca_['x'], cb_['y'] - ca_['y']), 3)
                    e['comparison_fit_A'] = ca_; e['comparison_fit_B'] = cb_
            res['per_band'][b] = e
        checks['motion_first_last_full_visit'] = res
    # forced photometry on co-adds (for detection checks)
    cphot = {}
    for (vv, b), a in coadd.items():
        v = next(x for x in visits if x['id'] == vv); xc, yc = v['target_px']['x'], v['target_px']['y']
        yy, xx = np.mgrid[0:NPIX, 0:NPIX]; rr = np.hypot(xx - xc, yy - yc)
        bad = (satfrac[(vv, b)] >= 0.5) | (badfrac[(vv, b)] >= 0.5) | ~np.isfinite(a)
        ap = rr <= R_AP; ann = (rr >= R_IN) & (rr <= R_OUT) & ~bad
        if bad[ap].any() or ann.sum() < 20: cphot[f"{vv}/{b}"] = dict(sn=None, note='masked pixels in aperture' if bad[ap].any() else 'annulus too small'); continue
        _, bk, sg = sigma_clipped_stats(a[ann], sigma=3)
        s = float((a[ap] - bk).sum()); n = ap.sum()
        # empirical noise: std of same-size aperture sums placed on random annulus-free positions is costly; use pixel std * sqrt(n)
        cphot[f"{vv}/{b}"] = dict(sum_MJy_sr_px=r6(s, 5), noise=r6(sg * np.sqrt(n), 5), sn=r6(s / (sg * np.sqrt(n)), 2), peak_over_sigma=r6(float((a[rr <= 1.5].max() - bk) / sg), 2))
    checks['coadd_forced_aperture'] = cphot
    allbinned = binned(pts)
    byvisit = {v['id']: binned([p for p in pts if p['visit'] == v['id']]) for v in visits}
    notes = list(T.get('notes', []))
    notes.append(f"Frames: {len(frames)} used of {len(glob.glob(f'cache/{tid}/*.npz'))} fetched; rejected {rej}. {nophot} frames had the target within {R_OUT} px of the strip/detector edge, so no forced photometry for them.")
    notes.append(f"Input coordinate {T['input_coord']} lies {inp_sep:.1f} arcsec from the mean-epoch ({Time(mjd_all, format='mjd').isot[:10]}) catalogue-propagated position.")
    os.makedirs(od, exist_ok=True)
    pm_desc = (f"{cat['catalog']} source {cat['source_id']}: pmra*cosdec={cat['pmra']:.3f} mas/yr, pmdec={cat['pmdec']:.3f} mas/yr, ref epoch {cat['ref_epoch']}; "
               + (f"parallax {cat['parallax']:.3f} mas applied (geocentric observer; SPHEREx LEO offset ignored)" if cat.get('parallax') else "parallax not applied (not available in catalogue row)")
               + (f"; radial velocity {cat['rv']:.2f} km/s used for perspective acceleration" if cat.get('rv') else ""))
    tj = dict(id=tid, name=T['name'], input=dict(coord=T['input_coord'], ra_deg=r6(ic.ra.deg, 7), dec_deg=r6(ic.dec.deg, 7), offset_from_mean_epoch_position_arcsec=r6(inp_sep, 2)),
              catalog=cat, proper_motion_source=pm_desc, default_band=db,
              mean_epoch=dict(mjd=r6(mjd_all, 5), date=Time(mjd_all, format='mjd').isot[:10], ra_deg=r6(ra_m, 7), dec_deg=r6(dec_m, 7)),
              grid=dict(NAXIS1=NPIX, NAXIS2=NPIX, CTYPE1='RA---TAN', CTYPE2='DEC--TAN', CRVAL1=r6(ra_m, 8), CRVAL2=r6(dec_m, 8),
                        CDELT1=-SCALE / 3600, CDELT2=SCALE / 3600, CRPIX1=(NPIX + 1) / 2, CRPIX2=(NPIX + 1) / 2, CUNIT1='deg', CUNIT2='deg', RADESYS='ICRS',
                        pixel_scale_arcsec=SCALE, orientation='north up, east left',
                        array_storage='PNG and .f32 rows are stored top-down (row 0 = north edge). FITS pixel y = NAXIS2-1-png_y; x is the same.'),
              visits=visits, comparison_star=comp, stretch=stretch, paths=paths, full_visits=full_vis,
              photometry=dict(aperture_radius_px=R_AP, annulus_px=[R_IN, R_OUT], flux_unit='uJy'),
              checks=checks, notes=notes)
    json.dump(tj, open(f"{od}/target.json", 'w'), indent=1, default=lambda o: o.item() if hasattr(o, 'item') else str(o))
    sj = dict(id=tid, name=T['name'], flux_unit='uJy', wavelength_unit='um',
              method=f"Forced circular-aperture photometry (r={R_AP} native px = {R_AP * SCALE:.1f} arcsec) on each individual SPHEREx L2 image at the proper-motion-corrected position for that image's MJD-AVG. Local background = 3-sigma-clipped median in a {R_IN}-{R_OUT} px annulus (flagged pixels excluded). Surface brightness MJy/sr converted to uJy with the local pixel solid angle from the image WCS (incl. SIP). Aperture correction = 1/(fraction of the image's own EPSF, for the detector zone containing the target, enclosed within r); the EPSF stamp extends to +/-3.3 px so this corrects to the EPSF footprint, not to infinity. Errors from the VARIANCE extension plus background-mean uncertainty.",
              saturated_definition="any pixel touching the aperture has OVERFLOW or NONLINEAR set; flux is null for these",
              flagged_definition="any pixel touching the aperture has one of " + ",".join(FLAG_NAMES) + " set, or is NaN (flux null if NaN)",
              n_points=len(pts), points=pts, binned=allbinned, binned_by_visit=byvisit)
    json.dump(sj, open(f"{od}/spectrum.json", 'w'), indent=0)
    print(tid, 'frames', len(frames), 'visits', [(v['id'], v['date_start'], v['date_end'], v['n_images'], v['full']) for v in visits], 'pts', len(pts))

if __name__ == '__main__':
    main(sys.argv[1])
