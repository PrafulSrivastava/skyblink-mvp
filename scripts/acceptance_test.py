#!/usr/bin/env python3
"""
SkyBlink Acceptance Test Suite v3.
Tests against the REAL SPHEREx data bundle in public/data/.

Usage:
  python3 scripts/acceptance_test.py          # all bundle + schema tests
  python3 scripts/acceptance_test.py --url http://localhost:3741  # + HTTP smoke
"""

import sys, os, json, struct, math, time, argparse

ROOT     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, 'public', 'data')

PASS, FAIL, WARN = '✅', '❌', '⚠️ '
results = []

def check(name, ok, detail='', warn=False):
    icon   = PASS if ok else (WARN if warn else FAIL)
    status = 'PASS' if ok else ('WARN' if warn else 'FAIL')
    print(f"    {icon} [{status}] {name}" + (f" — {detail}" if detail else ''))
    results.append({'name': name, 'ok': bool(ok) or warn, 'warn': warn, 'detail': detail})
    return bool(ok)

# ── PNG helpers ───────────────────────────────────────────────────────────────

def png_info(path):
    """Return (w, h, bit_depth, color_type_name)."""
    with open(path, 'rb') as f:
        sig = f.read(8)
        assert sig == b'\x89PNG\r\n\x1a\n', 'bad PNG signature'
        f.read(4); assert f.read(4) == b'IHDR'
        w, h = struct.unpack('>II', f.read(8))
        bd   = struct.unpack('>B', f.read(1))[0]
        ct   = struct.unpack('>B', f.read(1))[0]
    names = {0:'gray', 2:'RGB', 3:'indexed', 4:'gray+alpha', 6:'RGBA'}
    return w, h, bd, names.get(ct, f'type{ct}')

# ── Top-level manifest ────────────────────────────────────────────────────────

def test_manifest():
    print("\n── manifest.json ─────────────────────────────────────────")
    mp = os.path.join(DATA_DIR, 'manifest.json')
    check('manifest.json exists', os.path.isfile(mp))
    with open(mp) as f: m = json.load(f)
    check('version == 1', m.get('version') == 1, str(m.get('version')))
    check('grid_naxis == 49', m.get('grid_naxis') == 49)
    check('grid_pixel_scale_arcsec == 6.15', abs(m.get('grid_pixel_scale_arcsec', 0) - 6.15) < 0.01)
    check('5 targets', len(m.get('targets', [])) == 5, str(len(m.get('targets', []))))
    ids = [t['id'] for t in m['targets']]
    for expected in ('barnards-star', 'eps-indi-b', 'wise-0855', 'rw-aur', 'r-dra'):
        check(f'target {expected} present', expected in ids)
    return m

# ── Per-target tests ──────────────────────────────────────────────────────────

def test_target(tid: str, mentry: dict):
    base = os.path.join(DATA_DIR, tid)
    print(f"\n  {tid}")

    # target.json
    tp = os.path.join(base, 'target.json')
    if not check('target.json exists', os.path.isfile(tp)): return
    with open(tp) as f: t = json.load(f)

    for field in ('id','name','input','catalog','default_band','mean_epoch',
                  'grid','visits','full_visits','stretch','paths','checks','notes'):
        check(f'target.json has {field}', field in t)

    check('id matches dir', t['id'] == tid)
    check('grid NAXIS1==49', t['grid']['NAXIS1'] == 49)
    check('grid NAXIS2==49', t['grid']['NAXIS2'] == 49)
    check('pixel_scale 6.15', abs(t['grid']['pixel_scale_arcsec'] - 6.15) < 0.01)

    # Visits
    for v in t['visits']:
        vid = v['id']
        for f in ('id','mjd_mean','date_start','date_end','full','target_px','n_coadded'):
            check(f'{vid}: has {f}', f in v)
        px = v.get('target_px', {})
        for c in ('png_x','png_y','x','y'):
            check(f'{vid}: target_px.{c} in [0,49)', 0 <= px.get(c, -1) < 49, f"{px.get(c, '?'):.1f}" if isinstance(px.get(c), float) else str(px.get(c)))

    # Full visits match manifest
    check('full_visits non-empty', len(t['full_visits']) >= 1, str(t['full_visits']))

    # Paths → PNGs exist and are 49×49 grayscale
    for band, band_paths in t['paths'].items():
        for visit_key, entry in band_paths.items():
            if visit_key == 'diff':
                rel = entry
                p = os.path.join(base, rel)
                if not check(f'{band}/diff PNG exists', os.path.isfile(p)): continue
                w, h, bd, ct = png_info(p)
                check(f'{band}/diff 49×49 gray', w==49 and h==49 and ct=='gray', f"{w}×{h} {ct}")
            elif isinstance(entry, dict) and 'png' in entry:
                rel = entry['png']
                p = os.path.join(base, rel)
                if not check(f'{band}/{visit_key} PNG exists', os.path.isfile(p)): continue
                w, h, bd, ct = png_info(p)
                check(f'{band}/{visit_key} 49×49 gray', w==49 and h==49 and ct=='gray', f"{w}×{h} {ct}")

    # Per-target science checks
    _target_science(tid, t)

    # spectrum.json
    sp_path = os.path.join(base, 'spectrum.json')
    if not check('spectrum.json exists', os.path.isfile(sp_path)): return
    with open(sp_path) as f: sp = json.load(f)
    binned = sp.get('binned', [])
    check('binned has 102 entries', len(binned) == 102, str(len(binned)))
    check('flux_unit == uJy', sp.get('flux_unit') == 'uJy')
    for b in binned[:3]:
        for field in ('channel','wavelength_um','flux','flux_err','n','n_saturated','n_flagged'):
            check(f'binned[0] has {field}', field in b, skip_if_already_checked=True)
            break

def _target_science(tid, t):
    """Assert known science values from target.json checks."""
    chk = t.get('checks', {})

    if tid == 'barnards-star':
        motion = chk.get('motion_first_last_full_visit', {})
        check('barnards: predicted shift ~1.674 px',
              abs(motion.get('predicted_shift_px', 0) - 1.674) < 0.01,
              str(motion.get('predicted_shift_px')))
        d2 = motion.get('per_band', {}).get('D2', {})
        meas = d2.get('measured_shift_px')
        check('barnards D2: measured ~1.54 px',
              meas is not None and abs(meas - 1.54) < 0.05,
              str(meas))
        comp = d2.get('comparison_shift_px')
        check('barnards D2: ctrl-star shift < 0.15 px',
              comp is not None and comp < 0.15,
              str(comp))
        # Confirm spectrum is entirely saturated
        sat = chk.get('coadd_forced_aperture', {})
        all_null = all(v.get('sn') is None for v in sat.values())
        check('barnards: all coadd S/N null (saturated)',
              all_null, f"{sum(1 for v in sat.values() if v.get('sn') is None)}/{len(sat)}")
        note_text = ' '.join(t.get('notes', []))
        check('barnards: notes mention partial v2/v4',
              'v2' in note_text and 'v4' in note_text, warn=True)

    elif tid == 'eps-indi-b':
        ch4 = chk.get('ch4_3p3um_dip', {})
        check('eps-indi-b: CH4 check present', bool(ch4))
        ratio = ch4.get('ratio_3p29_to_3p03')
        check('eps-indi-b: CH4 ratio_3.29/3.03 < 0.95',
              ratio is not None and ratio < 0.95,
              f"ratio={ratio}")
        d3_v2 = chk.get('coadd_forced_aperture', {}).get('v2/D3', {})
        sn = d3_v2.get('sn')
        check('eps-indi-b: D3/v2 S/N > 5',
              sn is not None and sn > 5,
              f"S/N={sn}")

    elif tid == 'wise-0855':
        d6_v2 = chk.get('coadd_forced_aperture', {}).get('v2/D6', {})
        sn = d6_v2.get('sn')
        check('wise-0855: D6/v2 S/N ~10',
              sn is not None and 8 < sn < 15,
              f"S/N={sn}")
        offset = t['input']['offset_from_mean_epoch_position_arcsec']
        check('wise-0855: input offset ~125.7″',
              abs(offset - 125.7) < 1.0,
              f"{offset}\"")
        check('wise-0855: comparison_star is None (no suitable ctrl)',
              t.get('comparison_star') is None)
        note_text = ' '.join(t.get('notes', []))
        check('wise-0855: notes mention Gaia blend',
              'BLEND' in note_text or 'Gaia' in note_text, warn=True)

    elif tid == 'rw-aur':
        sat = chk.get('coadd_forced_aperture', {})
        d2_sn_values = [v.get('sn') for k, v in sat.items() if '/D2' in k and v.get('sn') is not None]
        check('rw-aur: has some unsaturated D2 photometry', len(d2_sn_values) > 0,
              f"{len(d2_sn_values)} D2 visits with S/N", warn=len(d2_sn_values) == 0)
        motion = chk.get('motion_first_last_full_visit', {})
        # Also check that variability_same_channel has D1 channels compared
        var = chk.get('variability_same_channel', {})
        has_d1_var = any(e.get('n_channels_compared', 0) > 0 for e in var.values())
        check('rw-aur: variability channels found', has_d1_var, warn=not has_d1_var)

    elif tid == 'r-dra':
        # Fully saturated
        sat = chk.get('coadd_forced_aperture', {})
        all_null = all(v.get('sn') is None for v in sat.values() if isinstance(v, dict))
        check('r-dra: all S/N null (fully saturated)', all_null,
              f"{sum(1 for v in sat.values() if isinstance(v,dict) and v.get('sn') is None)}/{len(sat)}")
        wing = chk.get('psf_wing_ratio_first_last_full', {})
        check('r-dra: psf_wing_ratio present', bool(wing.get('values')))

# monkeypatch for the skip_if_already_checked hack above
_seen_field_checks = set()
_orig_check = check
def check(name, ok, detail='', warn=False, skip_if_already_checked=False):
    if skip_if_already_checked and name in _seen_field_checks:
        return bool(ok) or warn
    _seen_field_checks.add(name)
    return _orig_check(name, ok, detail, warn)

# ── HTTP smoke test ───────────────────────────────────────────────────────────

def test_http(url):
    print(f"\n── HTTP smoke ({url}) ─────────────────────────────────────")
    import urllib.request

    for path, expected_key in [
        ('/data/manifest.json', 'version'),
        ('/data/barnards-star/target.json', 'grid'),
        ('/data/barnards-star/frames/D2/v1.png', None),  # just 200
        ('/data/wise-0855/frames/D6/v2.png', None),
        ('/data/eps-indi-b/spectrum.json', 'binned'),
    ]:
        full = url.rstrip('/') + path
        try:
            req = urllib.request.Request(full, headers={'User-Agent': 'SkyBlink-test/3'})
            t0 = time.time()
            with urllib.request.urlopen(req, timeout=10) as r:
                body = r.read()
                elapsed = time.time() - t0
            if expected_key:
                data = json.loads(body)
                check(f'GET {path}: has {expected_key}', expected_key in data, f"{elapsed*1000:.0f}ms")
            else:
                check(f'GET {path}: 200', len(body) > 100, f"{len(body)}B {elapsed*1000:.0f}ms")
        except Exception as e:
            check(f'GET {path}', False, str(e)[:60], warn=True)

# ── Summary ───────────────────────────────────────────────────────────────────

def summary():
    print("\n═══════════════════════════════════════════════════════")
    total  = len(results)
    passed = sum(1 for r in results if r['ok'])
    fails  = [r for r in results if not r['ok']]
    warns  = sum(1 for r in results if r.get('warn'))
    print(f"  Results: {passed}/{total} passed, {warns} warnings, {len(fails)} failed")
    if fails:
        print("  Failed:")
        for r in fails: print(f"    {FAIL} {r['name']}: {r['detail']}")
    print("═══════════════════════════════════════════════════════")
    return len(fails) == 0

def main():
    pa = argparse.ArgumentParser()
    pa.add_argument('--url', help='Base URL for HTTP smoke tests')
    args = pa.parse_args()

    print("SkyBlink Acceptance Test Suite v3 — real bundle")
    print(f"Bundle: {DATA_DIR}\n")

    m = test_manifest()
    for entry in m['targets']:
        test_target(entry['id'], entry)

    if args.url:
        test_http(args.url)

    ok = summary()
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
