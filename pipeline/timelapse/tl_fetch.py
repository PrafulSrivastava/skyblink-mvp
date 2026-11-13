"""Fetch unWISE time-resolved coadd cutouts (all single epochs) through WiseView's public cutout service.

The service (the backend of WiseView, Caselden et al. 2018; https://github.com/backyardworlds/wiseview) renders
cutouts of the unWISE time-resolved coadds (Meisner et al. 2018; neo11 epochs, 2010 to 2024) as 8-bit PNGs with a
linear stretch between minbright and maxbright. To get back near-float pixel values we fetch each epoch at three
linear ranges and keep, per pixel, the finest range that is not clipped.
"""
import os, sys, json, time, requests, numpy as np
from io import BytesIO
from PIL import Image
API = "https://vjxontvb73.execute-api.us-west-2.amazonaws.com/png-animation"
S3 = "https://amnh-citsci-public.s3-us-west-2.amazonaws.com/"
RANGES = [(-100.0, 1500.0), (-100.0, 25000.0), (-100.0, 400000.0)]
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tlcache')
S = requests.Session()

def get(url, params=None):
    for k in range(5):
        try:
            r = S.get(url, params=params, timeout=120)
            if r.status_code == 200: return r
        except Exception: pass
        time.sleep(2 + 3 * k)
    raise IOError(url)

def fetch(tid, ra, dec, band, size=170, tag=""):
    p = f"{CACHE}/{tid}{tag}_w{band}.npz"
    if os.path.exists(p): return dict(np.load(p, allow_pickle=True))
    stacks, meta = [], None
    for lo, hi in RANGES:
        q = dict(ra=ra, dec=dec, band=band, size=size, max_dyr=0, minbright=lo, maxbright=hi, invert=0, stretch=1, diff=0,
                 scandir=0, outer=0, neowise=0, window=0, diff_window=1, unique=1, smooth_scan=0, shift=0, pmx=0, pmy=0, synth_a=0, synth_b=0)
        m = get(API, q).json()
        if meta is None: meta = m
        assert len(m['ims']) == len(meta['ims'])
        stacks.append(np.array([np.array(Image.open(BytesIO(get(S3 + im).content)).convert('L')) for im in m['ims']]))
    out = None
    for (lo, hi), st in reversed(list(zip(RANGES, stacks))):
        v = lo + (hi - lo) * st.astype(float) / 255.0
        ok = (st > 0) & (st < 255)
        out = v if out is None else np.where(ok, v, out)
    sat = stacks[-1] >= 255
    d = dict(img=out.astype(np.float32), sat=sat, raw=np.array(stacks), mjd=np.array(meta['all_mjds']), epochs=np.array([e[0] for e in meta['epochs']]),
             scandir=np.array([s[0] for s in meta['scandirs']]), hdr=np.array(json.dumps({k: meta[k] for k in ('CRPIX1', 'CRPIX2', 'CRVAL1', 'CRVAL2', 'NAXIS1', 'NAXIS2')})),
             ra=ra, dec=dec, band=band)
    np.savez_compressed(p, **d)
    return d

if __name__ == '__main__':
    d = fetch(sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), int(sys.argv[4]))
    print(d['img'].shape, d['mjd'][[0, -1]], d['hdr'])
