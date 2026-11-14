"""Stage A: native SPHEREx strips (IMAGE, VARIANCE, FLAGS, WCS-WAVE) for every exposure in each candidate window.
Exposure list comes from IRSA MOST (catalog=spherex); bytes are range-read from the public S3 bucket nasa-irsa-spherex."""
import sys, os, json, numpy as np, concurrent.futures as cf
sys.path.insert(0, '/workspace/skyblink-data/pipeline')
import stage2
from astropy.io import ascii
stage2.R = 80
CANDS = {  # id: (MOST table, detector, start of window as listed by select2.py)
 'eros':      ('433',   1, '2025-07-07 18:43'),
 'eros-b':    ('433',   1, '2026-03-13 21:41'),
 'iris':      ('n7',    2, '2026-05-13 17:40'),
 'ganymed':   ('n1036', 3, '2025-11-27 11:26'),
 'psyche':    ('16',    3, '2025-09-09 07:03'),
 'lutetia':   ('21',    3, '2026-03-07 15:02'),
 'eunomia':   ('15',    1, '2025-12-24 00:34'),
}
W = json.load(open('windows.json'))
def window(cid):
    k, det, st = CANDS[cid]
    if cid == 'eros-b':
        t = ascii.read(f'most/{k}.tbl', format='ipac'); t['det'] = [int(p[1]) for p in t['productid']]
        s = t[(t['det'] == det)]; s.sort('mjd_start')
        i0 = [i for i, d in enumerate(s['start_date']) if d.startswith('2026-03-13 21:41')][0]
        s = s[(s['mjd_start'] >= s['mjd_start'][i0]) & (s['mjd_start'] <= s['mjd_start'][i0] + 1.7 / 24)]
        return s
    c = [c for c in W[k]['cands'] if c['det'] == det and c['start'].startswith(st)][0]
    t = ascii.read(f'most/{k}.tbl', format='ipac')
    want = set(c['exps']); sel = [i for i, r in enumerate(t) if f"{r['productid']}|{r['start_date']}" in want]
    s = t[sel]; s.sort('mjd_start'); return s
if __name__ == '__main__':
    for cid in (sys.argv[1:] or CANDS):
        s = window(cid)
        ra = np.array(s['ra_obj']); dec = np.array(s['dec_obj'])
        rac, decc = (ra[0] + ra[-1]) / 2, (dec[0] + dec[-1]) / 2
        os.makedirs(f'cache/{cid}', exist_ok=True)
        rows = []
        for r in s:
            key = r['uri'].split('ibe/data/spherex/')[1]
            obs = os.path.basename(key).split('_spx')[0].replace('level2_', '')
            rows.append(dict(key=key, obs=obs, row=dict(cloud_access=json.dumps({'aws': {'key': key}}), obs_id=obs, energy_bandpassname=f"SPHEREx-{r['productid']}",
                         obs_collection='spherex_' + key.split('/')[0]), most=dict(ra_obj=float(r['ra_obj']), dec_obj=float(r['dec_obj']), vmag=float(r['vmag']),
                         start=str(r['start_date']), mjd_start=float(r['mjd_start']), mjd_end=float(r['mjd_end']), sun_dist=float(r['sun_dist']), geo_dist=float(r['geo_dist']), phase=float(r['phase']))))
        def job(x):
            out = f"cache/{cid}/{x['obs']}.npz"
            if os.path.exists(out): return 'cached'
            try: return stage2.fetch(x['row'], rac, decc, out)['status']
            except Exception as e: return 'error ' + repr(e)[:200]
        with cf.ThreadPoolExecutor(8) as ex: st = list(ex.map(job, rows))
        json.dump(dict(id=cid, centre=[rac, decc], rows=rows, status=st), open(f'cache/{cid}/window.json', 'w'), indent=1)
        print(cid, len(rows), st)
