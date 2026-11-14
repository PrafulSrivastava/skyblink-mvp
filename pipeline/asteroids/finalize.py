"""Stage C: copy the kept targets into /workspace/skyblink-data/asteroids and the static site (PNGs upscaled 11x, nearest neighbour)."""
import json, os, shutil, sys, numpy as np
from PIL import Image
SITE = sys.argv[1] if len(sys.argv) > 1 else '/workspace/taste-pass/site'
KEEP = [('eros', 'eros-b', 'Eros'), ('lutetia', 'lutetia', 'Lutetia'), ('psyche', 'psyche', 'Psyche'), ('ganymed', 'ganymed', 'Ganymed')]
DROPPED = [
 dict(name='7 Iris', reason='Saturated (OVERFLOW) at the asteroid in all 7 frames of its best D2 window, with BLOOM in 4; one frame has no usable core at all.'),
 dict(name='15 Eunomia', reason='Saturated in all 9 D1 frames; the core is unmeasurable in 5 of them.'),
 dict(name='433 Eros, July 2025', reason='Clean (8 frames, 5.0 h, 72\u2033/h) but a second Eros window; the March 2026 pass moves twice as fast.'),
 dict(name='3200 Phaethon, 1620 Geographos, 3122 Florence, 4179 Toutatis', reason='MOST lists SPHEREx frames, but their predicted V of 18.5 to 21.6 is far fainter than Ganymed at 15.2, so they were not attempted.'),
]
def hm(h):
    m = int(round(h * 60)); return f"{m // 60} h {m % 60:02d} min" if m >= 60 else f"{m} min"
idx = dict(targets=[], dropped=DROPPED, barnard_arcsec_yr=10.39,
           method='Exposures found with IRSA MOST (catalog spherex); native strips range-read from the public nasa-irsa-spherex S3 bucket; '
                  'reprojected onto one north-up 89 x 89 px, 6.15\u2033/px TAN grid; JPL Horizons astrometric positions for observer SPHEREx (-163182) at each exposure mid-time.')
for sid, src, short in KEEP:
    J = json.load(open(f'out/{src}/asteroid.json')); J['id'] = sid
    od = f'/workspace/skyblink-data/asteroids/{sid}'; shutil.rmtree(od, ignore_errors=True); shutil.copytree(f'out/{src}', od)
    sd = f'{SITE}/data/asteroids/{sid}'; shutil.rmtree(sd, ignore_errors=True); os.makedirs(sd)
    for f in J['frames']:
        for p in 'fd':
            Image.open(f'out/{src}/{p}{f["i"]:02d}.png').resize((979, 979), Image.NEAREST).save(f'{sd}/{p}{f["i"]:02d}.png', optimize=True)
        f['img'] = f'f{f["i"]:02d}.png'; f['diff'] = f'd{f["i"]:02d}.png'
    fr = J['frames']; n = len(fr)
    sat = sum(f['saturated'] for f in fr); outl = sum('OUTLIER' in f['flags'] or 'TRANSIENT' in f['flags'] for f in fr)
    pers = sum('PERSIST' in f['flags'] for f in fr); hard = [k for k, f in enumerate(fr) if set(f['flags']) & {'NONFUNC', 'COLD', 'HOT', 'SUR_ERROR', 'MISSING_DATA'}]
    offs = sorted(f['fit_offset_arcsec'] for f in fr if f['fit_offset_arcsec'] is not None)
    # visits: gaps > 15 min
    vis = [[0]]
    for k in range(1, n):
        (vis[-1].append(k) if (fr[k]['mjd'] - fr[k - 1]['mjd']) * 1440 < 15 else vis.append([k]))
    labels = []
    if sat: labels.append(dict(kind='warn', text=f'Saturated core in {sat} of {n} frames (SPHEREx OVERFLOW bit). The position still fits, the brightness does not.'))
    if outl: labels.append(dict(kind='info', text=f'The pipeline\u2019s OUTLIER or TRANSIENT bit is set on the asteroid in {outl} of {n} frames, because it moved. SkyBlink keeps those pixels.'))
    if pers: labels.append(dict(kind='info', text=f'Persistence (PERSIST) from an earlier bright source near the asteroid in {pers} of {n} frames.'))
    if hard: labels.append(dict(kind='warn', text=f'Frame {", ".join(str(k + 1) for k in hard)}: dead or noisy pixels (NONFUNC, COLD or SUR_ERROR) within 2 px of the asteroid.'))
    J.update(short=short, n_visits=len(vis), visits=[dict(frames=v, utc=fr[v[0]]['utc'], n=len(v)) for v in vis], span_label=hm(J['span_hours']),
             median_fit_offset_arcsec=offs[len(offs) // 2] if offs else None, n_fitted=len(offs), labels=labels,
             wl_range=[min(f['wl_um'] for f in fr), max(f['wl_um'] for f in fr)],
             barnard_years_for_same_path=round(J['path_arcsec'] / 10.39, 1))
    json.dump(J, open(f'{sd}/asteroid.json', 'w'), indent=1); json.dump(J, open(f'{od}/asteroid.json', 'w'), indent=1)
    idx['targets'].append(dict(id=sid, short=short, name=J['name'], data=f'asteroids/{sid}/asteroid.json'))
    print(sid, n, J['span_label'], J['rate_arcsec_h'], J['rate_vs_barnard'], J['path_px'], J['barnard_years_for_same_path'], J['wl_range'], [l['text'][:50] for l in labels])
json.dump(idx, open(f'{SITE}/data/asteroids.json', 'w'), indent=1); json.dump(idx, open('/workspace/skyblink-data/asteroids.json', 'w'), indent=1)
