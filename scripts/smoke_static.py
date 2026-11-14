#!/usr/bin/env python3
"""
Smoke test for the static out/ build served locally.
Usage:  python3 scripts/smoke_static.py [--url http://localhost:3999]
"""

import sys, json, struct, urllib.request, urllib.error, argparse, time

PASS, FAIL, WARN = '✅', '❌', '⚠️ '
results = []

def check(name, ok, detail='', warn=False):
    icon   = PASS if ok else (WARN if warn else FAIL)
    status = 'PASS' if ok else ('WARN' if warn else 'FAIL')
    print(f"  {icon} [{status}] {name}" + (f" — {detail}" if detail else ''))
    results.append({'name': name, 'ok': bool(ok) or warn, 'warn': warn})
    return bool(ok)

def get(base, path, timeout=10):
    url = base.rstrip('/') + path
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'SkyBlink-smoke/1'})
        t0 = time.time()
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read()
            status = r.status
        return status, body, time.time() - t0
    except urllib.error.HTTPError as e:
        return e.code, b'', 0
    except Exception as e:
        return 0, b'', 0

def png_dims(data):
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        return None, None
    w, h = struct.unpack('>II', data[16:24])
    return w, h

def main():
    pa = argparse.ArgumentParser()
    pa.add_argument('--url', default='http://localhost:3999')
    args = pa.parse_args()
    base = args.url.rstrip('/')

    print(f"Smoke test: {base}")
    print()

    # ── Pages ───────────────────────────────────────────────────────────────
    print("── Pages ─────────────────────────────────────────────────────────")

    s, body, t = get(base, '/')
    check('GET / → 200', s == 200, f"{s} {len(body)}B {t*1000:.0f}ms")
    check('/ contains SkyBlink', b'SkyBlink' in body, warn=b'SkyBlink' not in body)

    # With Python http.server and trailingSlash, /viewer/ maps to viewer/index.html
    for path in ['/viewer/', '/battle/']:
        s, body, t = get(base, path)
        check(f'GET {path} → 200', s == 200, f"{s} {len(body)}B {t*1000:.0f}ms")

    # No /api/sky in static build
    s, _, _ = get(base, '/api/sky')
    check('/api/sky not served (404)', s == 404, f"got {s}", warn=s == 200)

    # ── Manifest ────────────────────────────────────────────────────────────
    print("\n── manifest.json ─────────────────────────────────────────────────")
    s, body, t = get(base, '/data/manifest.json')
    check('GET /data/manifest.json → 200', s == 200, f"{t*1000:.0f}ms")
    if s == 200:
        m = json.loads(body)
        check('manifest has 5 targets', len(m.get('targets', [])) == 5, str(len(m.get('targets', []))))
        check('manifest version == 1', m.get('version') == 1)
        ids = [t['id'] for t in m['targets']]
        for tid in ('barnards-star', 'eps-indi-b', 'wise-0855', 'rw-aur', 'r-dra'):
            check(f'  target {tid}', tid in ids)

    # ── Per-target data ────────────────────────────────────────────────────
    print("\n── Per-target data ───────────────────────────────────────────────")

    TARGETS = [
        ('barnards-star', 'D2', ['v1', 'v3', 'v5'], 'v1_v5'),
        ('eps-indi-b',    'D3', ['v2', 'v3'],       'v2_v3'),
        ('wise-0855',     'D6', ['v2', 'v4'],       'v2_v4'),
        ('rw-aur',        'D2', ['v1', 'v2'],       'v1_v3'),
        ('r-dra',         'D2', ['v1', 'v2'],       'v1_v3'),
    ]

    for tid, band, visits, diff_pair in TARGETS:
        print(f"\n  {tid}")

        # target.json
        s, body, t = get(base, f'/data/{tid}/target.json')
        ok = check(f'target.json → 200', s == 200, f"{t*1000:.0f}ms")
        if ok:
            tgt = json.loads(body)
            check('  grid NAXIS==49', tgt['grid']['NAXIS1'] == 49)
            # Input offset
            off = tgt['input']['offset_from_mean_epoch_position_arcsec']
            if tid == 'wise-0855':
                check(f'  WISE 0855 offset ~125.7″', abs(off - 125.7) < 1.0, f"{off}\"")
            # Motion check
            mc = tgt.get('checks', {}).get('motion_first_last_full_visit', {})
            if mc:
                check(f'  motion check present', bool(mc.get('predicted_shift_px')), str(mc.get('predicted_shift_px')))

        # Frames
        for vid in visits:
            s, body, t = get(base, f'/data/{tid}/frames/{band}/{vid}.png')
            if check(f'  frames/{band}/{vid}.png → 200', s == 200, f"{len(body)}B {t*1000:.0f}ms"):
                w, h = png_dims(body)
                check(f'  {band}/{vid}: 49×49', w == 49 and h == 49, f"{w}×{h}")

        # Diff
        s, body, t = get(base, f'/data/{tid}/diff/{band}/{diff_pair}.png')
        if check(f'  diff/{band}/{diff_pair}.png → 200', s == 200, f"{len(body)}B {t*1000:.0f}ms"):
            w, h = png_dims(body)
            check(f'  diff: 49×49', w == 49 and h == 49, f"{w}×{h}")

        # Spectrum
        s, body, t = get(base, f'/data/{tid}/spectrum.json')
        if check(f'  spectrum.json → 200', s == 200, f"{t*1000:.0f}ms"):
            sp = json.loads(body)
            check(f'  binned: 102 channels', len(sp.get('binned', [])) == 102)

    # ── URL state ─────────────────────────────────────────────────────────
    print("\n── URL state via query params ────────────────────────────────────")
    for path in [
        '/viewer/?target=barnards-star&band=D2',
        '/viewer/?target=wise-0855&band=D6',
        '/battle/',
    ]:
        s, body, t = get(base, path)
        check(f'GET {path[:45]} → 200', s == 200, f"{s} {t*1000:.0f}ms")

    # ── vercel.json ────────────────────────────────────────────────────────
    print("\n── vercel.json ────────────────────────────────────────────────────")
    s, body, t = get(base, '/vercel.json')
    if s == 200:
        vj = json.loads(body)
        check('vercel.json has cleanUrls', vj.get('cleanUrls') == True)
        check('vercel.json has headers', bool(vj.get('headers')))
    else:
        check('vercel.json accessible', False, f"got {s}", warn=True)

    # ── Summary ────────────────────────────────────────────────────────────
    print("\n══════════════════════════════════════════════════════════════")
    total  = len(results)
    passed = sum(1 for r in results if r['ok'])
    fails  = [r for r in results if not r['ok']]
    warns  = sum(1 for r in results if r.get('warn'))
    print(f"  Results: {passed}/{total} passed, {warns} warnings, {len(fails)} failed")
    if fails:
        for r in fails: print(f"    {FAIL} {r['name']}")
    print("══════════════════════════════════════════════════════════════")
    return len(fails) == 0

if __name__ == '__main__':
    sys.exit(0 if main() else 1)
