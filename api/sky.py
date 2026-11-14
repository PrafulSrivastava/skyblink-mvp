"""
SkyBlink Sky Service — Vercel Python Serverless Function.
Handles live queries for arbitrary coordinates (non-demo targets).
The 5 demo targets are served from static precomputed files in public/data/.

Dependencies (requirements.txt): numpy only (no astropy).
Manual FITS parsing and linear WCS math are used throughout.
"""

from http.server import BaseHTTPRequestHandler
import json
import os
import io
import math
import struct
import zlib
import urllib.request
import urllib.parse
import urllib.error

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

# ─── Target table (vetted hardcoded values) ───────────────────────────────────

TARGETS = {
    'barnards-star': {
        'name': "Barnard's Star",
        'ra': 269.4502, 'dec': 4.7181,
        'pmra': -801.551, 'pmdec': 10362.394,
        'ref_epoch': 2016.0, 'source': 'gaia_dr3',
        'default_band': 'D2', 'saturated': True,
    },
    'epsilon-indi-b': {
        'name': 'Epsilon Indi B',
        'ra': 330.8671, 'dec': -56.7928,
        'pmra': 3961.80, 'pmdec': -2538.43,
        'ref_epoch': 2016.0, 'source': 'gaia_dr3',
        'default_band': 'D3', 'saturated': False,
    },
    'wise-0855': {
        'name': 'WISE 0855−0714',
        'ra': 133.7638, 'dec': -7.2466,
        'pmra': -8081.0, 'pmdec': -721.0,
        'ref_epoch': 2015.4, 'source': 'catwise2020',
        'default_band': 'D6', 'saturated': False,
    },
    'rw-aurigae': {
        'name': 'RW Aurigae',
        'ra': 83.0956, 'dec': 30.4017,
        'pmra': -1.2, 'pmdec': -25.9,
        'ref_epoch': 2016.0, 'source': 'gaia_dr3',
        'default_band': 'D2', 'saturated': True,
    },
    'r-draconis': {
        'name': 'R Draconis',
        'ra': 271.5373, 'dec': 68.0381,
        'pmra': -26.4, 'pmdec': -4.1,
        'ref_epoch': 2016.0, 'source': 'gaia_dr3',
        'default_band': 'D2', 'saturated': True,
    },
}

DETECTOR_WAVELENGTHS = {
    'D1': (0.75, 1.10), 'D2': (1.10, 1.65), 'D3': (1.65, 2.42),
    'D4': (2.42, 3.17), 'D5': (3.17, 4.18), 'D6': (4.18, 5.00),
}

PIXEL_SCALE_DEG = 6.15 / 3600
IMAGE_SIZE = 256
SIA_BASE = "https://irsa.ipac.caltech.edu/SIA"

# ─── Coordinate utilities ─────────────────────────────────────────────────────

def apply_pm(ra, dec, pmra, pmdec, ref_epoch, mjd):
    to_epoch = 2000.0 + (mjd - 51544.5) / 365.25
    dt = to_epoch - ref_epoch
    cos_dec = math.cos(math.radians(dec))
    new_ra  = ra  + (pmra  / 3600000) * dt / max(cos_dec, 0.001)
    new_dec = dec + (pmdec / 3600000) * dt
    return new_ra, new_dec

def offset_arcsec(ra1, dec1, ra2, dec2):
    cos_dec = math.cos(math.radians((dec1 + dec2) / 2))
    return math.sqrt(((ra2-ra1)*cos_dec*3600)**2 + ((dec2-dec1)*3600)**2)

# ─── IRSA SIA query ──────────────────────────────────────────────────────────

def query_sia(ra, dec, radius_deg=0.15, timeout=18):
    frames = []
    seen = set()
    for collection in ('spherex_dr1', 'spherex_qr3'):
        url = (
            f"{SIA_BASE}?COLLECTION={collection}"
            f"&POS=CIRCLE+{ra:.6f}+{dec:.6f}+{radius_deg}"
            f"&FORMAT=application/json&MAXREC=500"
        )
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'SkyBlink/1.0'})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode())
            # VOTable JSON: data.table.fields / data.table.rows or data.data.fields / rows
            tbl = data.get('data') or data.get('table') or {}
            fields = [f.get('name') or f.get('ucd', '') for f in (tbl.get('fields') or tbl.get('columns') or [])]
            rows = tbl.get('rows') or tbl.get('data') or []
            if not fields:
                # flat format
                fields = list((rows[0] if rows else {}).keys()) if isinstance(rows[0], dict) else []
                rows = [[r[f] for f in fields] for r in rows] if rows and isinstance(rows[0], dict) else rows
            release = collection.split('_')[1].upper()
            for row in rows:
                frame = dict(zip(fields, row)) if not isinstance(row, dict) else row
                obs_id = str(frame.get('obs_id') or frame.get('obs_publisher_id') or '')
                det = _detector_from_frame(frame)
                key = f"{obs_id}_{det}"
                if key in seen:
                    continue
                seen.add(key)
                parsed = _parse_frame(frame, release)
                if parsed:
                    frames.append(parsed)
        except Exception:
            pass
    return frames

def _detector_from_frame(frame):
    for field in ('obs_id', 'obs_publisher_id', 'access_url', 'title'):
        v = str(frame.get(field, ''))
        for d in ('D1','D2','D3','D4','D5','D6'):
            if d.lower() in v.lower() or ('_' + d.lower()) in v.lower() or d in v:
                return d
    em = frame.get('em_min') or frame.get('wavelength_min')
    if em:
        w = float(em) * 1e6  # metres → µm
        for d, (lo, hi) in DETECTOR_WAVELENGTHS.items():
            if lo <= w <= hi:
                return d
    return 'D3'

def _parse_frame(frame, release):
    try:
        obs_id = str(frame.get('obs_id') or frame.get('obs_publisher_id') or '')
        t_min = float(frame.get('t_min') or frame.get('time_start') or 0)
        t_max = float(frame.get('t_max') or frame.get('time_stop') or t_min)
        mjd = (t_min + t_max) / 2
        access_url = str(frame.get('access_url') or frame.get('url') or '')
        det = _detector_from_frame(frame)
        lo, hi = DETECTOR_WAVELENGTHS.get(det, (2.0, 2.5))
        wave = (lo + hi) / 2
        from datetime import datetime, timedelta
        epoch = datetime(1858, 11, 17)
        date_obs = (epoch + timedelta(days=mjd)).strftime('%Y-%m-%d') if mjd > 0 else 'unknown'
        return {
            'obsId': obs_id, 'detector': det, 'mjd': mjd,
            'dateObs': date_obs, 'accessUrl': access_url,
            'release': release, 'psfFwhm': 7.5, 'wavelengthMicron': wave,
            'visitId': f"V{int(mjd // 20)}",
        }
    except Exception:
        return None

def group_visits(frames):
    if not frames:
        return []
    frames.sort(key=lambda f: f['mjd'])
    visits = {}
    for f in frames:
        vid = f['visitId']
        if vid not in visits:
            visits[vid] = {'visitId': vid, 'frames': [], 'detectors': set(),
                           'mjdMin': f['mjd'], 'mjdMax': f['mjd']}
        visits[vid]['frames'].append(f)
        visits[vid]['detectors'].add(f['detector'])
        visits[vid]['mjdMin'] = min(visits[vid]['mjdMin'], f['mjd'])
        visits[vid]['mjdMax'] = max(visits[vid]['mjdMax'], f['mjd'])
    result = []
    from datetime import datetime, timedelta
    epoch = datetime(1858, 11, 17)
    for v in sorted(visits.values(), key=lambda x: x['mjdMin']):
        start = (epoch + timedelta(days=v['mjdMin'])).strftime('%Y-%m-%d')
        end   = (epoch + timedelta(days=v['mjdMax'])).strftime('%Y-%m-%d')
        dets = list(v['detectors'])
        result.append({
            'visitId': v['visitId'],
            'visitType': 'full' if len(dets) >= 5 else 'partial',
            'dateRange': {'start': start, 'end': end},
            'mjdMid': (v['mjdMin'] + v['mjdMax']) / 2,
            'frames': v['frames'],
            'detectors': dets,
        })
    return result

# ─── Lightweight FITS reading (no astropy) ───────────────────────────────────

def _fits_header(buf):
    """Parse FITS header cards into a dict. Returns (header_dict, data_start_byte)."""
    hdr = {}
    pos = 0
    while True:
        block = buf[pos:pos+2880]
        if len(block) < 2880:
            break
        for i in range(0, 2880, 80):
            card = block[i:i+80].decode('ascii', errors='replace')
            kw = card[:8].strip()
            if kw == 'END':
                return hdr, pos + 2880
            if '=' in card:
                key, _, val_comment = card.partition('=')
                val = val_comment.split('/')[0].strip().strip("'")
                try:
                    hdr[key.strip()] = int(val)
                except ValueError:
                    try:
                        hdr[key.strip()] = float(val)
                    except ValueError:
                        hdr[key.strip()] = val
        pos += 2880
    return hdr, pos

def _hdu_offset(buf, hdu_index):
    """Seek to the data start of the nth HDU (0-based). Returns (header, data_offset, data_size)."""
    pos = 0
    for i in range(hdu_index + 1):
        hdr, pos = _fits_header(buf[pos:] if hasattr(buf, '__getitem__') else buf)
        if i > 0:
            # We need absolute offset
            break
        # advance past data of previous HDU
        bitpix = abs(hdr.get('BITPIX', 32))
        naxis = hdr.get('NAXIS', 0)
        npix = 1
        for ax in range(1, naxis + 1):
            npix *= hdr.get(f'NAXIS{ax}', 0)
        data_bytes = npix * (bitpix // 8)
        padded = math.ceil(data_bytes / 2880) * 2880
        pos += padded
    naxis = hdr.get('NAXIS', 2)
    n1 = hdr.get('NAXIS1', 0)
    n2 = hdr.get('NAXIS2', 0)
    bitpix = abs(hdr.get('BITPIX', 32))
    data_size = n1 * n2 * (bitpix // 8)
    return hdr, pos, data_size, n1, n2

def _read_fits_cutout_via_s3(access_url, cx_px, cy_px, half=32):
    """
    Read a 64×64 cutout from an uncompressed SPHEREx FITS IMAGE extension via S3 range read.
    access_url: direct URL to the FITS file on S3.
    cx_px, cy_px: target pixel (0-based, from WCS).
    Returns float32 2D array or None.
    """
    if not HAS_NUMPY:
        return None

    # Fetch the header first (first 23040 bytes = 8 blocks, enough for a full header)
    try:
        req = urllib.request.Request(
            access_url,
            headers={'Range': 'bytes=0-23039', 'User-Agent': 'SkyBlink/1.0'}
        )
        with urllib.request.urlopen(req, timeout=12) as resp:
            header_buf = resp.read()
    except Exception:
        return None

    # Try to find IMAGE extension (usually HDU 1 in SPHEREx files)
    try:
        hdr, data_start = _fits_header(header_buf)
    except Exception:
        return None

    # Check if this is the right HDU; if not, skip to next
    extname = hdr.get('EXTNAME', '')
    if extname and extname.upper() not in ('IMAGE', ''):
        return None

    bitpix = abs(hdr.get('BITPIX', 32))
    naxis1 = hdr.get('NAXIS1', 0)
    naxis2 = hdr.get('NAXIS2', 0)
    if naxis1 == 0 or naxis2 == 0:
        return None

    bytes_per_pix = bitpix // 8
    row_bytes = naxis1 * bytes_per_pix

    # Clamp cutout
    x0 = max(0, int(cx_px) - half)
    y0 = max(0, int(cy_px) - half)
    x1 = min(naxis1, x0 + 2 * half)
    y1 = min(naxis2, y0 + 2 * half)
    cut_w = x1 - x0
    cut_h = y1 - y0

    if cut_w <= 0 or cut_h <= 0:
        return None

    # Fetch each row
    rows_data = []
    for y in range(y0, y1):
        # FITS rows are stored bottom-up (NAXIS2 is row index from bottom)
        fits_y = naxis2 - 1 - y  # flip
        row_start = data_start + fits_y * row_bytes + x0 * bytes_per_pix
        row_end   = row_start + cut_w * bytes_per_pix - 1
        try:
            req = urllib.request.Request(
                access_url,
                headers={'Range': f'bytes={row_start}-{row_end}', 'User-Agent': 'SkyBlink/1.0'}
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                rows_data.append(resp.read())
        except Exception:
            return None

    raw = b''.join(rows_data)
    if len(raw) != cut_w * cut_h * bytes_per_pix:
        return None

    # Parse big-endian float32
    if bitpix == 32:
        arr = np.frombuffer(raw, dtype='>f4').reshape(cut_h, cut_w).astype(np.float32)
    elif bitpix == -32:
        arr = np.frombuffer(raw, dtype='>f4').reshape(cut_h, cut_w).astype(np.float32)
    elif bitpix == 64:
        arr = np.frombuffer(raw, dtype='>f8').reshape(cut_h, cut_w).astype(np.float32)
    elif bitpix == 16:
        raw_i = np.frombuffer(raw, dtype='>i2').reshape(cut_h, cut_w)
        bscale = hdr.get('BSCALE', 1.0)
        bzero  = hdr.get('BZERO',  0.0)
        arr = (raw_i.astype(np.float32) * bscale + bzero)
    else:
        return None

    return arr

def wcs_sky_to_pix(ra, dec, crpix, crval, cd):
    """
    Simple TAN projection: (RA,Dec) → pixel.
    crpix: (cp1, cp2) 1-based FITS convention.
    crval: (ra0, dec0).
    cd: [[cd11, cd12], [cd21, cd22]] degrees/pixel.
    Returns (px, py) 0-based.
    """
    ra0, dec0 = math.radians(crval[0]), math.radians(crval[1])
    ra1, dec1 = math.radians(ra), math.radians(dec)
    # TAN projection
    cosc = math.sin(dec0)*math.sin(dec1) + math.cos(dec0)*math.cos(dec1)*math.cos(ra1-ra0)
    if abs(cosc) < 1e-10:
        return crpix[0] - 1, crpix[1] - 1
    x_tan = -(math.cos(dec1)*math.sin(ra1-ra0)) / cosc
    y_tan = -(math.sin(dec0)*math.cos(dec1)*math.cos(ra1-ra0) - math.cos(dec0)*math.sin(dec1)) / cosc
    x_deg = math.degrees(x_tan)
    y_deg = math.degrees(y_tan)
    # Inverse CD matrix
    cd11, cd12 = cd[0][0], cd[0][1]
    cd21, cd22 = cd[1][0], cd[1][1]
    det = cd11*cd22 - cd12*cd21
    if abs(det) < 1e-20:
        return crpix[0] - 1, crpix[1] - 1
    p1 = (cd22*x_deg - cd12*y_deg) / det + (crpix[0] - 1)
    p2 = (-cd21*x_deg + cd11*y_deg) / det + (crpix[1] - 1)
    return p1, p2

# ─── PNG encoding ─────────────────────────────────────────────────────────────

def make_png(arr_rgb):
    """Encode uint8 HxWx3 array as PNG bytes."""
    h, w = arr_rgb.shape[:2]
    def chunk(tag, data):
        crc = zlib.crc32(tag + data) & 0xffffffff
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', crc)
    rows = b''.join(b'\x00' + bytes(arr_rgb[y].flat) for y in range(h))
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    idat = chunk(b'IDAT', zlib.compress(rows, 6))
    iend = chunk(b'IEND', b'')
    return b'\x89PNG\r\n\x1a\n' + ihdr + idat + iend

def array_to_png_b64(arr_rgb):
    import base64
    return 'data:image/png;base64,' + base64.b64encode(make_png(arr_rgb)).decode()

def asinh_stretch_rgb(arr2d, beta=3.0):
    """Float 2D array → uint8 RGB, asinh stretched."""
    if not HAS_NUMPY:
        return b''
    finite = arr2d[np.isfinite(arr2d)]
    if len(finite) == 0:
        return np.full((arr2d.shape[0], arr2d.shape[1], 3), 40, dtype=np.uint8)
    vmin = float(np.percentile(finite, 1.0))
    vmax = float(np.percentile(finite, 99.5))
    scale = max(vmax - vmin, 1e-30)
    normed = np.arcsinh((arr2d - vmin) / scale * beta) / math.asinh(beta)
    normed = np.clip(normed, 0, 1)
    grey = (normed * 255).astype(np.uint8)
    rgb = np.stack([grey, grey, grey], axis=2)
    rgb[~np.isfinite(arr2d)] = [40, 40, 50]
    return rgb

# ─── Synthetic fallback (clearly labelled simulated) ─────────────────────────

def synthetic_stack_frames(target_id, n_visits=2):
    """Generate minimal synthetic frames for unknown targets (live API fallback)."""
    if not HAS_NUMPY:
        return []

    rng = np.random.default_rng(hash(target_id or 'live') % (2**32))
    size = IMAGE_SIZE
    frames = []

    for i in range(n_visits):
        from datetime import datetime, timedelta
        d = datetime(2025, 5, 15) + timedelta(days=180 * i)
        date_str = d.strftime('%Y-%m-%d')
        mjd = 60444 + 182 * i

        img = np.zeros((size, size), dtype=np.float32)
        img += rng.normal(100, 5, (size, size))

        rng2 = np.random.default_rng(1234)
        for _ in range(50):
            sx, sy = rng2.integers(5, size-5), rng2.integers(5, size-5)
            flux = float(rng2.exponential(60))
            sigma = float(rng2.uniform(1.0, 2.5))
            for dy in range(-4, 5):
                for dx in range(-4, 5):
                    px, py = sx+dx, sy+dy
                    if 0 <= px < size and 0 <= py < size:
                        img[py, px] += flux * math.exp(-(dx**2+dy**2)/(2*sigma**2))

        for dy in range(-6, 7):
            for dx in range(-6, 7):
                px, py = size//2+dx, size//2+dy
                if 0 <= px < size and 0 <= py < size:
                    img[py, px] += 150 * math.exp(-(dx**2+dy**2)/4.0)

        rgb = asinh_stretch_rgb(img)
        frames.append({
            'visitId': f'V{i+1}', 'visitType': 'full' if i == 0 else 'partial',
            'dateObs': date_str, 'mjd': float(mjd), 'band': 'D3',
            'imageDataUrl': array_to_png_b64(rgb),
            'width': size, 'height': size,
            'crosshairPx': {'x': float(size/2), 'y': float(size/2)},
            'nFrames': 12, 'wavelengthMicron': 2.0, 'simulated': True,
        })
    return frames

# ─── Handlers ─────────────────────────────────────────────────────────────────

def handle_resolve(params):
    tid = params.get('targetId')
    if tid and tid in TARGETS:
        t = TARGETS[tid]
        mjd_now = 60540.0
        new_ra, new_dec = apply_pm(t['ra'], t['dec'], t['pmra'], t['pmdec'], t['ref_epoch'], mjd_now)
        return {
            'ra': new_ra, 'dec': new_dec,
            'targetId': tid, 'name': t['name'],
            'pmra': t['pmra'], 'pmdec': t['pmdec'],
            'refEpoch': t['ref_epoch'], 'source': t['source'],
            'staleOffsetArcsec': offset_arcsec(t['ra'], t['dec'], new_ra, new_dec),
            'defaultBand': t['default_band'], 'saturated': t['saturated'],
            'inputRa': t['ra'], 'inputDec': t['dec'],
        }
    ra, dec = params.get('ra'), params.get('dec')
    if ra is not None and dec is not None:
        return {'ra': float(ra), 'dec': float(dec), 'source': 'user_input'}
    return {'error': 'No target or coordinates'}

def handle_frames(params):
    tid = params.get('targetId')
    ra  = float(params.get('ra',  TARGETS.get(tid or '', {}).get('ra', 0)))
    dec = float(params.get('dec', TARGETS.get(tid or '', {}).get('dec', 0)))
    frames = query_sia(ra, dec)
    if frames:
        visits = group_visits(frames)
        return {'visits': visits, 'totalFrames': len(frames),
                'coverage': 'full' if len(visits) >= 2 else 'partial' if visits else 'none'}
    return {'visits': [], 'totalFrames': 0, 'coverage': 'none',
            'message': 'No frames found at IRSA for this position'}

def handle_live_stack(params):
    """Live stack for non-demo targets. Returns synthetic placeholder if IRSA unreachable."""
    tid  = params.get('targetId')
    band = params.get('band', 'D3')
    frames = []

    # Try IRSA
    ra = float(params.get('ra',  TARGETS.get(tid or '', {}).get('ra', 0) if tid else 0))
    dec = float(params.get('dec', TARGETS.get(tid or '', {}).get('dec', 0) if tid else 0))
    if ra or dec:
        sia_frames = query_sia(ra, dec)
        if sia_frames:
            visits = group_visits(sia_frames)
            for v in visits[:3]:
                v_frames = [f for f in v['frames'] if f.get('detector') == band]
                if not v_frames:
                    v_frames = v['frames'][:1]
                if not v_frames:
                    continue
                f = v_frames[0]
                frames.append({
                    'visitId': v['visitId'], 'visitType': v['visitType'],
                    'dateObs': v['dateRange']['start'], 'mjd': float(v['mjdMid']),
                    'band': band, 'imageDataUrl': '',  # fetched client-side
                    'width': IMAGE_SIZE, 'height': IMAGE_SIZE,
                    'crosshairPx': {'x': float(IMAGE_SIZE/2), 'y': float(IMAGE_SIZE/2)},
                    'nFrames': len(v_frames), 'wavelengthMicron': f.get('wavelengthMicron', 2.0),
                    'accessUrl': f.get('accessUrl', ''), 'simulated': False,
                })

    # Fallback
    if not frames:
        frames = synthetic_stack_frames(tid, n_visits=2)

    return {'frames': frames, 'diff': None, 'targetId': tid, 'band': band, 'simulated': not frames or frames[0].get('simulated', True)}

def handle_spectrum(params):
    """Spectrum. For live queries, return a minimal synthetic placeholder."""
    tid = params.get('targetId')

    # Only generate meaningful spectrum for known targets
    if not HAS_NUMPY:
        return {'points': [], 'molecularBands': [], 'simulated': True}

    import numpy as np
    n = 102
    wavelengths = list(float(x) for x in [w for w in (0.75 + i * (5.0 - 0.75) / (n - 1) for i in range(n))])
    saturated = tid in TARGETS and TARGETS[tid].get('saturated', False)

    points = []
    for i, w in enumerate(wavelengths):
        sat = saturated and w < 2.0
        points.append({
            'wavelengthMicron': round(w, 3),
            'flux': 0.0, 'fluxErr': 0.0,
            'visitId': 'V1', 'obsId': f'live_{i:04d}',
            'flags': [], 'saturated': sat,
        })

    return {
        'targetId': tid, 'simulated': True,
        'points': points,
        'molecularBands': [
            {'name': 'H₂O', 'wavelength': 1.4,  'width': 0.1},
            {'name': 'H₂O', 'wavelength': 1.9,  'width': 0.1},
            {'name': 'CH₄', 'wavelength': 2.2,  'width': 0.1},
            {'name': 'CH₄', 'wavelength': 3.3,  'width': 0.2},
            {'name': 'CO',  'wavelength': 2.35, 'width': 0.05},
            {'name': 'CO₂', 'wavelength': 4.25, 'width': 0.1},
        ],
    }

# ─── Vercel handler ───────────────────────────────────────────────────────────

class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if HAS_NUMPY:
            if isinstance(obj, (type(np.int64(1)),)):
                return int(obj)
            if isinstance(obj, (type(np.float64(1.0)),)):
                return float(obj)
        return super().default(obj)

class handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # silence access logs

    def _send_json(self, code, data):
        body = json.dumps(data, cls=NumpyEncoder).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        # Parse query string action
        path = self.path.split('?', 1)
        qs = urllib.parse.parse_qs(path[1]) if len(path) > 1 else {}
        params = {k: v[0] for k, v in qs.items()}
        self._handle(params)

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            params = json.loads(body.decode()) if body else {}
        except Exception:
            params = {}
        self._handle(params)

    def _handle(self, params):
        action = params.get('action', '')
        try:
            if action == 'resolve':
                result = handle_resolve(params)
            elif action == 'frames':
                result = handle_frames(params)
            elif action == 'stack':
                result = handle_live_stack(params)
            elif action == 'spectrum':
                result = handle_spectrum(params)
            else:
                result = {'error': f'Unknown action: {action}'}
            self._send_json(200, result)
        except Exception as e:
            self._send_json(500, {'error': str(e)})
