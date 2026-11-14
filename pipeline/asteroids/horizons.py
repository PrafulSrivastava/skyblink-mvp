"""JPL Horizons astrometric RA/Dec (ICRF) + rates + V for each exposure's MJD-AVG, observer = SPHEREx spacecraft (-163182)."""
import requests, json, numpy as np, sys
API = "https://ssd.jpl.nasa.gov/api/horizons.api"
def ephem(cmd, mjds, center='500@-163182'):
    jds = [m + 2400000.5 for m in mjds]
    p = dict(format='json', COMMAND=f"'{cmd}'", OBJ_DATA='NO', MAKE_EPHEM='YES', EPHEM_TYPE='OBSERVER', CENTER=f"'{center}'",
             TLIST=' '.join(f"'{j:.8f}'" for j in jds), TLIST_TYPE='JD', TIME_TYPE='UT', QUANTITIES="'1,3,9,19,20,24'", ANG_FORMAT='DEG', CSV_FORMAT='YES', EXTRA_PREC='YES')
    r = requests.get(API, params=p, timeout=120).json()
    txt = r.get('result', '')
    if '$$SOE' not in txt: raise RuntimeError(txt[-1500:])
    hdr = txt.split('$$SOE')[0].strip().splitlines()
    cols = None
    for l in hdr[::-1]:
        if 'R.A.' in l and 'Date' in l: cols = [c.strip() for c in l.split(',')]; break
    body = txt.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines()
    out = []
    for l in body:
        v = [c.strip() for c in l.split(',')]
        d = dict(zip(cols, v)); out.append(d)
    return cols, out, txt
if __name__ == '__main__':
    c, o, t = ephem('433;', [60863.78])
    print(c); print(o)
