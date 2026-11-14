"""Stage B: put every exposure of each candidate window on one north-up TAN grid (89x89 px, 6.15"/px), overlay JPL Horizons
positions, measure the asteroid at each predicted position, and write PNGs + asteroids.json.
Science arrays stay in cache/; only display PNGs go to the site."""
import sys, os, io, json, glob, numpy as np
sys.path.insert(0, '/workspace/skyblink-data/pipeline')
import stage3
from stage3 import BITS, SAT_MASK, FLAG_MASK, BAD_MASK, PB, gauss_fit, asinh8, div8, save_png
from astropy.io import fits
from astropy.wcs import WCS
from astropy.time import Time
from astropy.stats import sigma_clipped_stats
from horizons import ephem
NPIX = 89; SCALE = 6.15; stage3.NPIX = NPIX
NAMES = {'eros': ('433;', '433 Eros', 'near-Earth asteroid (Amor group)'), 'eros-b': ('433;', '433 Eros', 'near-Earth asteroid (Amor group)'),
         'iris': ('7;', '7 Iris', 'main-belt asteroid'), 'ganymed': ('1036;', '1036 Ganymed', 'near-Earth asteroid (largest Amor)'),
         'psyche': ('16;', '16 Psyche', 'main-belt asteroid, target of NASA\'s Psyche mission'), 'lutetia': ('21;', '21 Lutetia', 'main-belt asteroid, Rosetta flyby target'),
         'eunomia': ('15;', '15 Eunomia', 'main-belt asteroid')}
BARNARD = 10.39  # arcsec/yr, Gaia DR3 total proper motion of Barnard's Star
def load(p):
    d = np.load(p, allow_pickle=False)
    hs = d['header'].item() if d['header'].dtype.kind in 'SU' else d['header']; hs = hs.decode() if isinstance(hs, bytes) else str(hs)
    hdr = fits.Header.fromstring(hs); w = WCS(hdr)
    wave = fits.open(io.BytesIO(PB + d['wave'].tobytes()))
    hl = fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(header=hdr), wave[1]])
    sw = WCS(hdr, fobj=hl, key='W'); sw.sip = None
    return dict(img=d['img'], var=d['var'], flags=d['flags'], x0=int(d['x0']), y0=int(d['y0']), w=w, sw=sw, hdr=hdr, mjd=float(hdr['MJD-AVG']), det=int(hdr['DETECTOR']),
                bits=json.loads(str(d['bits'])), url=str(d['url']))
def grid(ra, dec):
    g = WCS(naxis=2); g.wcs.ctype = ['RA---TAN', 'DEC--TAN']; g.wcs.crval = [ra, dec]; g.wcs.cdelt = [-SCALE / 3600, SCALE / 3600]
    g.wcs.crpix = [(NPIX + 1) / 2, (NPIX + 1) / 2]; g.wcs.cunit = ['deg', 'deg']; g.wcs.radesys = 'ICRS'; return g
# Hardware/data-loss bits only. OUTLIER and TRANSIENT are NOT masked: the pipeline sets them on the moving asteroid itself,
# so masking them would erase the very thing this page shows. They are reported per frame instead.
HARD = sum(1 << BITS[n] for n in ['NONFUNC', 'MISSING_DATA', 'HOT', 'COLD', 'SUR_ERROR'])
from scipy.ndimage import map_coordinates
def reproject(f, g):
    img = f['img']; fl = f['flags']
    good = np.isfinite(img) & ((fl & HARD) == 0)
    _, med, _ = sigma_clipped_stats(img[good], sigma=3)
    filled = np.where(good, img - med, 0.0)
    yy, xx = np.mgrid[0:NPIX, 0:NPIX]
    ra, dec = g.wcs_pix2world(xx, yy, 0)
    px, py = f['w'].all_world2pix(ra, dec, 0); px = px - f['x0']; py = py - f['y0']
    inside = (px >= 0) & (px <= img.shape[1] - 1) & (py >= 0) & (py <= img.shape[0] - 1)
    v = map_coordinates(filled, [py, px], order=1, mode='constant', cval=0)
    wgt = map_coordinates(good.astype(float), [py, px], order=1, mode='constant', cval=0)
    out = np.where(inside & (wgt >= 0.5), v / np.maximum(wgt, 1e-6), np.nan)
    satm = map_coordinates(((fl & SAT_MASK) != 0).astype(np.uint8), [py, px], order=0, mode='constant', cval=0).astype(bool)
    badm = map_coordinates((((fl & HARD) != 0) | ~np.isfinite(img)).astype(np.uint8), [py, px], order=0, mode='constant', cval=0).astype(bool)
    return out.astype(np.float32), satm & inside, badm & inside, inside
def flag_names(v, bits):
    inv = {b: n for n, b in bits.items()} if bits else {b: n for n, b in BITS.items()}
    return sorted({inv.get(k, f'bit{k}') for k in range(32) if v >> k & 1})
def main(cid):
    W = json.load(open(f'cache/{cid}/window.json')); cmd, name, kind = NAMES[cid]
    fr = [dict(**load(f"cache/{cid}/{x['obs']}.npz"), obs=x['obs'], most=x['most'], key=x['key']) for x in W['rows']]
    fr.sort(key=lambda f: f['mjd'])
    cols, eph, _ = ephem(cmd, [f['mjd'] for f in fr])
    for f, e in zip(fr, eph):
        f['h'] = dict(ra=float(e['R.A.___(ICRF)']), dec=float(e['DEC____(ICRF)']), dra=float(e['dRA*cosD']), ddec=float(e['d(DEC)/dt']), V=float(e['APmag']),
                      r=float(e['r']), delta=float(e['delta']), phase=float(e['S-T-O']), date=e['Date__(UT)__HR:MN:SC.fff'])
    # grid centre: midpoint of first and last Horizons position
    ra0, dec0 = fr[0]['h']['ra'], fr[0]['h']['dec']; ra1, dec1 = fr[-1]['h']['ra'], fr[-1]['h']['dec']
    g = grid((ra0 + ra1) / 2, (dec0 + dec1) / 2)
    stacks = []
    for f in fr:
        out, satm, badm, inside = reproject(f, g)
        f['grid'] = out; f['sat'] = satm; f['bad'] = badm; f['inside'] = inside
        gx, gy = (float(v) for v in g.wcs_world2pix(f['h']['ra'], f['h']['dec'], 0)); f['gx'], f['gy'] = gx, gy
        nx, ny = (float(v) for v in f['w'].all_world2pix(f['h']['ra'], f['h']['dec'], 0)); f['nx'], f['ny'] = nx, ny
        wl, bw = (float(v) for v in f['sw'].pixel_to_world_values(nx, ny)); f['wl'] = wl; f['bw'] = bw
        # flags in the native 5x5 box around the predicted position
        ix, iy = int(round(nx)) - f['x0'], int(round(ny)) - f['y0']
        box = f['flags'][max(0, iy - 2):iy + 3, max(0, ix - 2):ix + 3]
        allf = int(np.bitwise_or.reduce(box.ravel())) if box.size else 0
        f['flags_near'] = [n for n in flag_names(allf, f['bits']) if n != 'SOURCE']
        f['sat_near'] = bool(allf & SAT_MASK); f['on_det'] = bool(0 <= nx <= 2039 and 0 <= ny <= 2039)
    # static sky = median over frames; the asteroid moves >5 px so it drops out
    cube = np.array([f['grid'] for f in fr]); static = np.nanmedian(cube, 0)
    fin = np.concatenate([f['grid'][np.isfinite(f['grid'])] for f in fr])
    lo, hi = float(np.percentile(fin, 10)), float(np.percentile(fin, 99.6))
    dsig = []
    od = f'out/{cid}'; os.makedirs(od, exist_ok=True)
    for f in fr: f['diff'] = f['grid'] - static
    sd = sigma_clipped_stats(np.concatenate([f['diff'][np.isfinite(f['diff'])] for f in fr]), sigma=3)[2]
    res = []
    for i, f in enumerate(fr):
        a8 = asinh8(f['grid'], lo, hi, 0.08); a8[f['sat']] = 255
        save_png(a8, f'{od}/f{i:02d}.png'); save_png((f['sat'] * 255).astype(np.uint8), f'{od}/s{i:02d}.png')
        save_png(div8(f['diff'], 25 * sd, 0.05), f'{od}/d{i:02d}.png')
        # measure on the static-subtracted frame at the Horizons position
        m = gauss_fit(f['diff'], f['gx'], f['gy'], rfit=4.0)
        _, bk, sg = sigma_clipped_stats(f['grid'][np.isfinite(f['grid'])], sigma=3)
        yy, xx = np.mgrid[0:NPIX, 0:NPIX]; ap = np.hypot(xx - f['gx'], yy - f['gy']) <= 2.0
        pk = float(np.nanmax(np.where(ap, f['diff'], np.nan))) if np.isfinite(f['diff'][ap]).any() else None
        snr = pk / sd if pk is not None else None
        off = None
        if m and snr and snr > 5: off = float(np.hypot(m['x'] - f['gx'], m['y'] - f['gy']) * SCALE)
        res.append(dict(i=i, obs_id=f['obs'], det=f'D{f["det"]}', mjd=round(f['mjd'], 6), utc=Time(f['mjd'], format='mjd').isot[:19] + 'Z',
            wl_um=round(f['wl'], 3), horizons=dict(ra=round(f['h']['ra'], 7), dec=round(f['h']['dec'], 7), V=f['h']['V'], rate_arcsec_h=round(float(np.hypot(f['h']['dra'], f['h']['ddec'])), 2)),
            px=[round(f['gx'], 2), round(NPIX - 1 - f['gy'], 2)], on_detector=f['on_det'], peak_snr=None if snr is None else round(snr, 1),
            fit_offset_arcsec=None if off is None else round(off, 2), saturated=f['sat_near'], flags=f['flags_near'],
            coverage=round(float(f['inside'].mean()), 3), sat_px_grid=int(f['sat'].sum()), source=f"s3://nasa-irsa-spherex/{f['key']}"))
    h0, h1 = fr[0]['h'], fr[-1]['h']
    gap = (fr[-1]['mjd'] - fr[0]['mjd']) * 24
    from astropy.coordinates import SkyCoord; import astropy.units as u
    sep = SkyCoord(h0['ra'] * u.deg, h0['dec'] * u.deg).separation(SkyCoord(h1['ra'] * u.deg, h1['dec'] * u.deg)).arcsec
    rate = sep / gap
    J = dict(id=cid, name=name, kind=kind, detector=f'D{fr[0]["det"]}', n_frames=len(fr), span_hours=round(gap, 2), path_arcsec=round(sep, 1), path_px=round(sep / SCALE, 1),
             rate_arcsec_h=round(rate, 1), rate_vs_barnard=round(rate * 8766 / BARNARD), V=round(np.mean([f['h']['V'] for f in fr]), 2),
             r_au=round(h0['r'], 3), delta_au=round(h0['delta'], 3), phase_deg=round(h0['phase'], 1), stretch=dict(lo=lo, hi=hi, unit='MJy/sr after local median removal'),
             diff_sigma=float(sd), grid=dict(npix=NPIX, scale=SCALE, crval=[round(float(g.wcs.crval[0]), 7), round(float(g.wcs.crval[1]), 7)], orientation='north up, east left'), frames=res)
    json.dump(J, open(f'{od}/asteroid.json', 'w'), indent=1, default=float)
    print(f"{cid:8s} n={len(fr)} span={gap:.1f}h rate={rate:.1f}\"/h path={sep/SCALE:.1f}px V={J['V']}")
    for r in res: print(f"   {r['utc']} {r['det']} {r['wl_um']}um px={r['px']} snr={r['peak_snr']} off={r['fit_offset_arcsec']} sat={r['saturated']} flags={r['flags']} cov={r['coverage']}")
if __name__ == '__main__':
    for c in sys.argv[1:]: main(c)
