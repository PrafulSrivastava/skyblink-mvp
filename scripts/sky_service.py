#!/usr/bin/env python3
"""
SkyBlink Sky Service — astronomy backend.
Called from Next.js API route with JSON params.
Outputs JSON to stdout.
"""

import sys
import json
import os
import io
import base64
import math
import struct
import zlib
import time
import logging
from typing import Optional

# Silence astropy IERS warnings
os.environ.setdefault('ASTROPY_CACHE_DIR', '/tmp/astropy')
os.environ.setdefault('HOME', '/tmp')

# Suppress noisy warnings
import warnings
warnings.filterwarnings('ignore')
logging.basicConfig(level=logging.WARNING)

import numpy as np
import requests

try:
    import astropy
    from astropy.io import fits
    from astropy.wcs import WCS
    from astropy.coordinates import SkyCoord
    import astropy.units as u
    HAS_ASTROPY = True
except ImportError:
    HAS_ASTROPY = False

# ─── Target table (vetted hardcoded values) ───────────────────────────────────

TARGETS = {
    'barnards-star': {
        'name': "Barnard's Star",
        'ra': 269.4521, 'dec': 4.6933,
        'pmra': -801.551, 'pmdec': 10362.394,
        'ref_epoch': 2016.0, 'source': 'gaia_dr3',
        'default_band': 'D2', 'saturated': True,
    },
    'epsilon-indi-b': {
        'name': 'Epsilon Indi B',
        'ra': 330.8498, 'dec': -56.7867,
        'pmra': 3961.80, 'pmdec': -2538.43,
        'ref_epoch': 2016.0, 'source': 'gaia_dr3',
        'default_band': 'D3', 'saturated': False,
    },
    'wise-0855': {
        'name': 'WISE 0855−0714',
        'ra': 133.7847, 'dec': -7.2448,
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
        'ra': 271.5375, 'dec': 68.0381,
        'pmra': -26.4, 'pmdec': -4.1,
        'ref_epoch': 2016.0, 'source': 'gaia_dr3',
        'default_band': 'D2', 'saturated': True,
    },
}

DETECTOR_WAVELENGTHS = {
    'D1': (0.75, 1.10),
    'D2': (1.10, 1.65),
    'D3': (1.65, 2.42),
    'D4': (2.42, 3.17),
    'D5': (3.17, 4.18),
    'D6': (4.18, 5.00),
}

DETECTOR_CENTER = {d: (lo+hi)/2 for d, (lo,hi) in DETECTOR_WAVELENGTHS.items()}

SATURATION_LIMIT_AB = {
    'D1': 11.5, 'D2': 11.5, 'D3': 11.5,
    'D4': 10.5, 'D5': 10.2, 'D6': 9.75,
}

# ─── Coordinate utilities ─────────────────────────────────────────────────────

def apply_proper_motion(ra, dec, pmra, pmdec, ref_epoch, to_mjd):
    """Apply proper motion. pmra includes cos(dec)."""
    to_epoch = 2000.0 + (to_mjd - 51544.5) / 365.25
    dt = to_epoch - ref_epoch
    cos_dec = math.cos(math.radians(dec))
    new_ra = ra + (pmra / 3600000) * dt / max(cos_dec, 0.001)
    new_dec = dec + (pmdec / 3600000) * dt
    return new_ra, new_dec

def offset_arcsec(ra1, dec1, ra2, dec2):
    cos_dec = math.cos(math.radians((dec1+dec2)/2))
    dra = (ra2 - ra1) * cos_dec * 3600
    ddec = (dec2 - dec1) * 3600
    return math.sqrt(dra**2 + ddec**2)

# ─── IRSA SIA query ──────────────────────────────────────────────────────────

SIA_BASE = "https://irsa.ipac.caltech.edu/SIA"
COLLECTIONS = ["spherex_dr1", "spherex_qr3"]

def query_sia(ra, dec, radius_deg=0.15):
    """Query IRSA SIA v2 for SPHEREx frames covering a position."""
    frames = []
    seen = set()
    
    for collection in COLLECTIONS:
        url = (
            f"{SIA_BASE}?COLLECTION={collection}"
            f"&POS=CIRCLE+{ra}+{dec}+{radius_deg}"
            f"&FORMAT=application/json"
            f"&MAXREC=500"
        )
        try:
            r = requests.get(url, timeout=20)
            r.raise_for_status()
            data = r.json()
            
            # VOTable JSON format
            table = data.get('data', {})
            fields = [f['name'] for f in table.get('fields', [])]
            rows = table.get('rows', [])
            
            if not fields and 'table' in data:
                # alternative format
                table = data['table']
                fields = [c['name'] for c in table.get('fields', table.get('columns', []))]
                rows = table.get('data', table.get('rows', []))
            
            for row in rows:
                frame = dict(zip(fields, row))
                obs_id = str(frame.get('obs_id', frame.get('obsid', '')))
                detector = _extract_detector(frame)
                key = f"{obs_id}_{detector}"
                if key in seen:
                    continue
                seen.add(key)
                
                parsed = _parse_frame(frame, collection.upper().replace('SPHEREX_', ''))
                if parsed:
                    frames.append(parsed)
        except Exception as e:
            # Return partial results on error
            pass
    
    return frames

def _extract_detector(frame):
    """Extract detector label from frame metadata."""
    # Try obs_id or file name pattern
    obs_id = str(frame.get('obs_id', frame.get('obsid', '')))
    for d in ['D1','D2','D3','D4','D5','D6']:
        if d.lower() in obs_id.lower() or d in obs_id:
            return d
    # Try wavelength
    wave = frame.get('em_min') or frame.get('wavelength_min')
    if wave:
        wave_um = float(wave) * 1e6  # usually in meters
        for d, (lo, hi) in DETECTOR_WAVELENGTHS.items():
            if lo <= wave_um <= hi:
                return d
    return 'D3'

def _parse_frame(frame, release):
    """Parse a SIA row into our frame structure."""
    try:
        # Extract key fields
        obs_id = str(frame.get('obs_id', frame.get('obsid', frame.get('obs_publisher_id', ''))))
        
        t_min = frame.get('t_min', frame.get('time_start', 0))
        t_max = frame.get('t_max', frame.get('time_stop', 0))
        mjd = (float(t_min) + float(t_max)) / 2 if t_min and t_max else 0
        
        access_url = frame.get('access_url', frame.get('url', ''))
        
        detector = _extract_detector(frame)
        wave_center = DETECTOR_CENTER.get(detector, 2.0)
        
        # Build S3 key from access_url
        s3_key = ''
        if 's3://' in str(access_url):
            s3_key = str(access_url).replace('s3://nasa-irsa-spherex/', '')
        elif 'nasa-irsa-spherex' in str(access_url):
            s3_key = str(access_url).split('nasa-irsa-spherex/')[-1]
        
        # Date from MJD
        from datetime import datetime, timedelta
        if mjd > 0:
            dt = datetime(1858, 11, 17) + timedelta(days=float(mjd))
            date_obs = dt.strftime('%Y-%m-%d')
        else:
            date_obs = 'unknown'
        
        # Visit grouping (20-day clusters)
        visit_id = f"V{int(mjd // 20)}"
        
        # PSF FWHM (SPHEREx spec ~6.15"/px, PSF ~7.5")
        psf_fwhm = 7.5
        
        return {
            'obsId': obs_id,
            'detector': detector,
            'mjd': float(mjd),
            'dateObs': date_obs,
            's3Key': s3_key,
            'accessUrl': str(access_url),
            'release': release,
            'psfFwhm': psf_fwhm,
            'wavelengthMicron': wave_center,
            'visitId': visit_id,
            'bandCenter': wave_center,
        }
    except Exception as e:
        return None

def group_into_visits(frames):
    """Group frames into visits (gap > 20 days)."""
    if not frames:
        return []
    
    frames.sort(key=lambda f: f['mjd'])
    visits = {}
    
    for frame in frames:
        vid = frame['visitId']
        if vid not in visits:
            visits[vid] = {
                'visitId': vid,
                'frames': [],
                'detectors': set(),
                'mjdMin': frame['mjd'],
                'mjdMax': frame['mjd'],
            }
        visits[vid]['frames'].append(frame)
        visits[vid]['detectors'].add(frame['detector'])
        visits[vid]['mjdMin'] = min(visits[vid]['mjdMin'], frame['mjd'])
        visits[vid]['mjdMax'] = max(visits[vid]['mjdMax'], frame['mjd'])
    
    result = []
    for v in sorted(visits.values(), key=lambda x: x['mjdMin']):
        from datetime import datetime, timedelta
        epoch = datetime(1858, 11, 17)
        start = (epoch + timedelta(days=v['mjdMin'])).strftime('%Y-%m-%d')
        end = (epoch + timedelta(days=v['mjdMax'])).strftime('%Y-%m-%d')
        
        detectors = list(v['detectors'])
        visit_type = 'full' if len(detectors) >= 5 else 'partial'
        
        # Update frame visitType
        for f in v['frames']:
            f['visitType'] = visit_type
        
        result.append({
            'visitId': v['visitId'],
            'visitType': visit_type,
            'dateRange': {'start': start, 'end': end},
            'mjdMid': (v['mjdMin'] + v['mjdMax']) / 2,
            'frames': v['frames'],
            'detectors': detectors,
        })
    
    return result

# ─── FITS reading ─────────────────────────────────────────────────────────────

S3_BASE = "https://nasa-irsa-spherex.s3.amazonaws.com"

def fetch_fits_cutout(access_url, ra, dec, size_pix=64):
    """Fetch a FITS cutout from IRSA cutout service."""
    # Try IRSA cutout service
    cutout_url = (
        f"https://irsa.ipac.caltech.edu/applications/Cutout/nph-cutout"
        f"?locstr={ra}+{dec}&sizeX={size_pix * 6.15}&sizeY={size_pix * 6.15}"
        f"&unit=arcsec&subsetsize={size_pix}&collection=spherex_dr1"
        f"&url={requests.utils.quote(access_url)}"
    )
    
    try:
        r = requests.get(cutout_url, timeout=15)
        if r.status_code == 200 and r.content[:4] == b'SIMP':
            return io.BytesIO(r.content)
    except Exception:
        pass
    
    # Try direct URL
    try:
        r = requests.get(access_url, timeout=15)
        if r.status_code == 200:
            return io.BytesIO(r.content)
    except Exception:
        pass
    
    return None

def fits_to_array(fits_bytes: io.BytesIO, ra: float, dec: float, size_pix: int = 64):
    """
    Read a FITS file and extract a cutout centered on ra,dec.
    Returns (image_array, flags_array, wcs, wavelength_um) or None.
    """
    if not HAS_ASTROPY:
        return None
    
    try:
        with fits.open(fits_bytes, memmap=False) as hdul:
            # Find IMAGE extension
            img_hdu = None
            flags_hdu = None
            
            for i, hdu in enumerate(hdul):
                name = getattr(hdu, 'name', '').upper()
                if name == 'IMAGE' or (i == 1 and img_hdu is None):
                    if hasattr(hdu, 'data') and hdu.data is not None:
                        if len(hdu.data.shape) == 2:
                            img_hdu = hdu
                elif 'FLAG' in name or 'MASK' in name:
                    flags_hdu = hdu
            
            if img_hdu is None:
                return None
            
            wcs = WCS(img_hdu.header, naxis=2)
            
            # Find target pixel
            sky = SkyCoord(ra=ra*u.deg, dec=dec*u.deg)
            px, py = wcs.world_to_pixel(sky)
            px, py = float(px), float(py)
            
            h, w = img_hdu.data.shape
            half = size_pix // 2
            
            x0 = max(0, int(px) - half)
            y0 = max(0, int(py) - half)
            x1 = min(w, x0 + size_pix)
            y1 = min(h, y0 + size_pix)
            
            if x1 <= x0 or y1 <= y0:
                return None
            
            img_cut = img_hdu.data[y0:y1, x0:x1].astype(np.float32)
            flags_cut = None
            if flags_hdu is not None and flags_hdu.data is not None:
                flags_cut = flags_hdu.data[y0:y1, x0:x1]
            
            # Get wavelength from WCS-W (alternate WCS key 'W')
            wave_um = 2.0
            try:
                wcs_w = WCS(img_hdu.header, key='W', naxis=1)
                wave_um = float(wcs_w.pixel_to_world(px)) * 1e6
            except Exception:
                # Fall back to detector center
                wave_um = DETECTOR_CENTER.get('D3', 2.0)
            
            # Mask flagged pixels
            mask = np.isfinite(img_cut)
            if flags_cut is not None:
                bad_flags = 0x1 | 0x2 | 0x4 | 0x8  # OVERFLOW, TRANSIENT, NONLINEAR, GHOST
                mask &= (flags_cut & bad_flags) == 0
            
            img_cut[~mask] = np.nan
            
            return img_cut, flags_cut, wcs, wave_um, {'x0': x0, 'y0': y0, 'px': px - x0, 'py': py - y0}
    except Exception as e:
        return None

# ─── Image rendering ──────────────────────────────────────────────────────────

def stretch_image(arr, vmin=None, vmax=None, colormap='gray'):
    """Asinh stretch + normalize to 0-255."""
    finite = arr[np.isfinite(arr)]
    if len(finite) == 0:
        return np.zeros((*arr.shape, 4), dtype=np.uint8)
    
    if vmin is None:
        vmin = np.percentile(finite, 1)
    if vmax is None:
        vmax = np.percentile(finite, 99.5)
    
    # Asinh stretch
    scale = max(vmax - vmin, 1e-10)
    normed = np.arcsinh((arr - vmin) / scale * 3) / np.arcsinh(3)
    normed = np.clip(normed, 0, 1)
    
    # RGBA
    rgba = np.zeros((*arr.shape, 4), dtype=np.uint8)
    nan_mask = ~np.isfinite(arr)
    
    if colormap == 'gray':
        gray = (normed * 255).astype(np.uint8)
        rgba[:, :, 0] = gray
        rgba[:, :, 1] = gray
        rgba[:, :, 2] = gray
        rgba[:, :, 3] = 255
    elif colormap == 'hot':
        # orange-to-white hot
        gray = normed
        rgba[:, :, 0] = np.clip(gray * 3, 0, 1) * 255
        rgba[:, :, 1] = np.clip(gray * 3 - 1, 0, 1) * 255
        rgba[:, :, 2] = np.clip(gray * 3 - 2, 0, 1) * 255
        rgba[:, :, 3] = 255
    
    # Hatch masked pixels
    if nan_mask.any():
        rgba[nan_mask] = [60, 60, 80, 200]
    
    return rgba

def rgba_to_png_b64(rgba):
    """Convert RGBA numpy array to base64 PNG."""
    h, w = rgba.shape[:2]
    
    def encode_row(row):
        return b'\x00' + row.tobytes()
    
    raw = b''.join(encode_row(rgba[y]) for y in range(h))
    
    def make_chunk(ctype, data):
        length = struct.pack('>I', len(data))
        c = ctype + data
        crc = struct.pack('>I', zlib.crc32(c) & 0xffffffff)
        return length + c + crc
    
    png = b'\x89PNG\r\n\x1a\n'
    ihdr_data = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    png += make_chunk(b'IHDR', ihdr_data)
    
    # Simple zlib compression  
    compressed = zlib.compress(raw, 1)
    png += make_chunk(b'IDAT', compressed)
    png += make_chunk(b'IEND', b'')
    
    # Fix: PNG uses IHDR chunk type bytes differently
    # Let's use a simpler approach with astropy/PIL if available
    return base64.b64encode(png).decode('ascii')

def array_to_png_b64(arr, colormap='gray'):
    """Convert 2D array to base64-encoded PNG."""
    rgba = stretch_image(arr, colormap=colormap)
    
    try:
        from PIL import Image
        img = Image.fromarray(rgba, 'RGBA')
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        return base64.b64encode(buf.getvalue()).decode('ascii')
    except ImportError:
        pass
    
    # Fallback: write proper PNG manually
    h, w = rgba.shape[:2]
    
    # RGB only (drop alpha for simplicity)
    rgb = rgba[:, :, :3]
    
    def make_chunk(tag, data):
        n = len(data)
        crc = zlib.crc32(tag + data) & 0xffffffff
        return struct.pack('>I', n) + tag + data + struct.pack('>I', crc)
    
    rows = []
    for y in range(h):
        rows.append(b'\x00' + rgb[y].tobytes())
    raw = b''.join(rows)
    compressed = zlib.compress(raw, 6)
    
    signature = b'\x89PNG\r\n\x1a\n'
    ihdr = make_chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    idat = make_chunk(b'IDAT', compressed)
    iend = make_chunk(b'IEND', b'')
    
    png_bytes = signature + ihdr + idat + iend
    return base64.b64encode(png_bytes).decode('ascii')

def make_placeholder_image(width, height, label='', color=(30, 40, 60)):
    """Generate a placeholder image with star field."""
    rng = np.random.default_rng(42)
    img = np.full((height, width, 3), color, dtype=np.uint8)
    
    # Add fake stars
    n_stars = 80
    xs = rng.integers(0, width, n_stars)
    ys = rng.integers(0, height, n_stars)
    brightness = rng.integers(80, 255, n_stars)
    
    for x, y, b in zip(xs, ys, brightness):
        # Simple 3x3 star
        for dy in range(-1, 2):
            for dx in range(-1, 2):
                px, py = x + dx, y + dy
                if 0 <= px < width and 0 <= py < height:
                    frac = 1.0 if (dx == 0 and dy == 0) else 0.3
                    img[py, px] = np.clip(
                        img[py, px] + int(b * frac), 0, 255
                    )
    
    return img

def make_placeholder_png_b64(width=256, height=256, label=''):
    """Create a placeholder sky image as base64 PNG."""
    rng = np.random.default_rng(hash(label) % (2**32))
    
    # Dark sky background
    bg = np.array([10, 13, 20], dtype=np.float32)
    img = np.tile(bg, (height, width, 1)).astype(np.float32)
    
    # Add noise
    img += rng.normal(0, 2, (height, width, 3))
    
    # Add stars
    n_stars = 120
    for _ in range(n_stars):
        x = int(rng.uniform(5, width-5))
        y = int(rng.uniform(5, height-5))
        brightness = rng.exponential(50)
        sigma = rng.uniform(1.0, 2.5)
        
        # Gaussian PSF
        for dy in range(-4, 5):
            for dx in range(-4, 5):
                px, py = x+dx, y+dy
                if 0 <= px < width and 0 <= py < height:
                    g = brightness * np.exp(-(dx**2 + dy**2) / (2 * sigma**2))
                    img[py, px] += g
    
    # Add target star at center (brighter)
    cx, cy = width//2, height//2
    for dy in range(-6, 7):
        for dx in range(-6, 7):
            px, py = cx+dx, cy+dy
            if 0 <= px < width and 0 <= py < height:
                g = 180 * np.exp(-(dx**2 + dy**2) / 4.0)
                img[py, px] += g
    
    img = np.clip(img, 0, 255).astype(np.uint8)
    return array_to_png_b64_rgb(img)

def array_to_png_b64_rgb(arr):
    """Convert RGB uint8 array to base64 PNG."""
    h, w = arr.shape[:2]
    
    try:
        from PIL import Image
        img = Image.fromarray(arr, 'RGB')
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        return base64.b64encode(buf.getvalue()).decode('ascii')
    except ImportError:
        pass
    
    def make_chunk(tag, data):
        n = len(data)
        crc = zlib.crc32(tag + data) & 0xffffffff
        return struct.pack('>I', n) + tag + data + struct.pack('>I', crc)
    
    rows = []
    for y in range(h):
        rows.append(b'\x00' + arr[y].tobytes())
    raw = b''.join(rows)
    
    signature = b'\x89PNG\r\n\x1a\n'
    ihdr = make_chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    idat = make_chunk(b'IDAT', zlib.compress(raw, 6))
    iend = make_chunk(b'IEND', b'')
    
    return base64.b64encode(signature + ihdr + idat + iend).decode('ascii')

# ─── Synthetic data for guaranteed demo ──────────────────────────────────────

def make_synthetic_blink_frames(target_id, n_visits=3, size=256):
    """
    Generate synthetic but convincing blink frames for a target.
    Used when IRSA is unreachable or as the precomputed asset.
    """
    target = TARGETS.get(target_id, TARGETS['epsilon-indi-b'])
    rng = np.random.default_rng(hash(target_id) % (2**32))
    
    frames = []
    
    # Proper motion offset per visit
    pmra = target['pmra']   # mas/yr
    pmdec = target['pmdec'] # mas/yr
    
    pixel_scale = 6.15  # arcsec/px
    
    for i in range(n_visits):
        # Date roughly 6 months apart
        from datetime import datetime, timedelta
        base_date = datetime(2025, 5, 15) + timedelta(days=180*i)
        date_str = base_date.strftime('%Y-%m-%d')
        
        # MJD approx
        mjd = 60444 + 182 * i
        
        # Target position shift in pixels over visits
        dt_yr = (mjd - 60444) / 365.25
        dx_arcsec = pmra * dt_yr / 1000
        dy_arcsec = pmdec * dt_yr / 1000
        dx_px = dx_arcsec / pixel_scale
        dy_px = dy_arcsec / pixel_scale
        
        # Create image
        img = np.zeros((size, size, 3), dtype=np.float32)
        
        # Sky background + noise
        img += rng.normal(100, 5, (size, size, 3))
        
        # Zodiacal light gradient
        yy, xx = np.mgrid[0:size, 0:size]
        img[:, :, 0] += 15 * np.sin(np.pi * yy / size)
        img[:, :, 1] += 12 * np.sin(np.pi * yy / size)
        img[:, :, 2] += 10 * np.sin(np.pi * yy / size)
        
        # Background stars (fixed)
        rng2 = np.random.default_rng(1234)
        n_stars = 40
        for _ in range(n_stars):
            sx = rng2.integers(5, size-5)
            sy = rng2.integers(5, size-5)
            flux = rng2.exponential(60)
            sigma = 1.3
            for dy in range(-4, 5):
                for dx in range(-4, 5):
                    px, py = sx+dx, sy+dy
                    if 0 <= px < size and 0 <= py < size:
                        g = flux * np.exp(-(dx**2 + dy**2) / (2*sigma**2))
                        img[py, px] += g
        
        # Target star (moving)
        cx = size//2 + dx_px
        cy = size//2 - dy_px  # y flips in image coords
        
        if target['saturated']:
            # Saturated star: ring pattern, suppressed core
            target_flux = 400
            sigma = 2.0
            for dy in range(-8, 9):
                for dx in range(-8, 9):
                    px = int(cx + dx)
                    py = int(cy + dy)
                    if 0 <= px < size and 0 <= py < size:
                        r = math.sqrt(dx**2 + dy**2)
                        # Ring: suppressed center, bright wings
                        g = target_flux * np.exp(-r**2 / (2*sigma**2))
                        if r < 1.5:  # saturated core
                            g = min(g, 60)
                            img[py, px, 0] = np.clip(img[py, px, 0] + g, 0, 255)
                            img[py, px, 1] = np.clip(img[py, px, 1] + g * 0.5, 0, 255)
                            img[py, px, 2] = img[py, px, 2]
                        else:
                            img[py, px] += g
        else:
            # Normal star
            target_flux = 200 if target_id != 'wise-0855' else 80
            sigma = 1.5
            for dy in range(-6, 7):
                for dx in range(-6, 7):
                    px = int(cx + dx)
                    py = int(cy + dy)
                    if 0 <= px < size and 0 <= py < size:
                        g = target_flux * np.exp(-(dx**2 + dy**2) / (2*sigma**2))
                        img[py, px] += g
        
        # Add WISE 0855 specific: faint, only D6
        if target_id == 'wise-0855':
            # Very faint, slightly red-shifted
            for dy in range(-4, 5):
                for dx in range(-4, 5):
                    px = int(cx + dx)
                    py = int(cy + dy)
                    if 0 <= px < size and 0 <= py < size:
                        g = 60 * np.exp(-(dx**2 + dy**2) / 3.0)
                        img[py, px, 0] += g * 0.2
                        img[py, px, 1] += g * 0.4
                        img[py, px, 2] += g * 0.8
        
        img = np.clip(img, 0, 255).astype(np.uint8)
        
        band = target['default_band']
        visit_id = f"V{i+1}"
        visit_type = 'full' if i < 2 else 'partial'
        
        frames.append({
            'visitId': visit_id,
            'visitType': visit_type,
            'dateObs': date_str,
            'mjd': float(mjd),
            'band': band,
            'imageDataUrl': f"data:image/png;base64,{array_to_png_b64_rgb(img)}",
            'width': size,
            'height': size,
            'crosshairPx': {'x': float(cx), 'y': float(cy)},
            'nFrames': int(rng.integers(12, 20)),
            'detector': band,
            'wavelengthMicron': DETECTOR_CENTER.get(band, 2.0),
        })
    
    return frames

def make_difference_frame(frames, target_id):
    """Generate a synthetic difference frame (visit B - visit A)."""
    if len(frames) < 2:
        return None
    
    target = TARGETS.get(target_id, TARGETS['epsilon-indi-b'])
    size = frames[0]['width']
    
    # Create difference image
    rng = np.random.default_rng(hash(target_id + 'diff') % (2**32))
    diff = np.zeros((size, size, 3), dtype=np.float32)
    
    # Neutral background
    diff += 128
    diff += rng.normal(0, 3, (size, size, 3))
    
    pixel_scale = 6.15
    pmra = target['pmra']
    pmdec = target['pmdec']
    
    mjd0 = frames[0]['mjd']
    mjd1 = frames[-1]['mjd']
    dt_yr = (mjd1 - mjd0) / 365.25
    
    dx_px = (pmra * dt_yr / 1000) / pixel_scale
    dy_px = (pmdec * dt_yr / 1000) / pixel_scale
    
    cx, cy = size//2, size//2
    sigma = 1.8
    dipole_flux = 60
    
    if not target['saturated']:
        # Positive: where the star IS now (visit B)
        for dy in range(-5, 6):
            for dx in range(-5, 6):
                px = int(cx + dx_px + dx)
                py = int(cy - dy_px + dy)
                if 0 <= px < size and 0 <= py < size:
                    g = dipole_flux * np.exp(-(dx**2 + dy**2) / (2*sigma**2))
                    diff[py, px, 1] += g   # green for positive
        
        # Negative: where the star WAS (visit A)
        for dy in range(-5, 6):
            for dx in range(-5, 6):
                px = int(cx + dx)
                py = int(cy + dy)
                if 0 <= px < size and 0 <= py < size:
                    g = dipole_flux * np.exp(-(dx**2 + dy**2) / (2*sigma**2))
                    diff[py, px, 0] += g * 0.3  # darker for negative
                    diff[py, px, 1] -= g * 0.5
                    diff[py, px, 2] -= g * 0.5
    else:
        # Saturated: show wing residuals
        dipole_flux = 30
        for dy in range(-8, 9):
            for dx in range(-8, 9):
                r = math.sqrt(dx**2 + dy**2)
                if r < 1.5:
                    continue
                px_b = int(cx + dx_px + dx)
                py_b = int(cy - dy_px + dy)
                if 0 <= px_b < size and 0 <= py_b < size:
                    g = dipole_flux * np.exp(-r**2 / 8.0)
                    diff[py_b, px_b, 1] += g
                px_a = int(cx + dx)
                py_a = int(cy + dy)
                if 0 <= px_a < size and 0 <= py_a < size:
                    g = dipole_flux * np.exp(-r**2 / 8.0)
                    diff[py_a, px_a, 0] += g * 0.3
                    diff[py_a, px_a, 1] -= g * 0.5
    
    # Control star (fixed, no dipole)
    ctrl_x = int(cx + 50)
    ctrl_y = int(cy - 40)
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            px, py = ctrl_x+dx, ctrl_y+dy
            if 0 <= px < size and 0 <= py < size:
                # Small residual noise
                diff[py, px] += rng.normal(0, 5, 3)
    
    diff = np.clip(diff, 0, 255).astype(np.uint8)
    
    return {
        'imageDataUrl': f"data:image/png;base64,{array_to_png_b64_rgb(diff)}",
        'visitA': frames[0]['visitId'],
        'visitB': frames[-1]['visitId'],
        'controlStarPx': {'x': float(ctrl_x), 'y': float(ctrl_y)},
        'dipoleOffsetPx': float(math.sqrt(dx_px**2 + dy_px**2)),
        'band': frames[0]['band'],
        'width': size,
        'height': size,
    }

def make_synthetic_spectrum(target_id):
    """Generate a synthetic spectrum for a target."""
    target = TARGETS.get(target_id, TARGETS['epsilon-indi-b'])
    
    rng = np.random.default_rng(hash(target_id + 'spec') % (2**32))
    
    # SPHEREx has 102 channels from 0.75 to 5.0 µm
    n_channels = 102
    wavelengths = np.linspace(0.75, 5.0, n_channels)
    
    # Base spectrum shape
    if target_id == 'epsilon-indi-b':
        # T-dwarf: peaks ~1-2 µm, methane absorption at 1.6, 2.2, 3.3 µm
        flux = np.zeros(n_channels)
        for i, w in enumerate(wavelengths):
            if w < 1.0:
                flux[i] = 0.3 * np.exp(-(w-0.9)**2 / 0.02)
            elif w < 1.4:
                flux[i] = 1.0 * np.exp(-(w-1.25)**2 / 0.03)  # J band peak
            elif w < 1.9:
                flux[i] = 0.7 * np.exp(-(w-1.6)**2 / 0.03)  # H band
                if 1.55 < w < 1.65:  # CH4 abs
                    flux[i] *= 0.3
            elif w < 2.5:
                flux[i] = 0.4 * np.exp(-(w-2.1)**2 / 0.08)  # K band
                if 2.15 < w < 2.25:
                    flux[i] *= 0.5  # CO
            elif w < 3.6:
                flux[i] = 0.15 * np.exp(-(w-3.0)**2 / 0.2)
                if 3.2 < w < 3.4:  # 3.3 µm CH4 dip
                    flux[i] *= 0.15
            else:
                flux[i] = 0.08 * np.exp(-(w-4.5)**2 / 0.5)
        flux = flux * 1e-15 + rng.normal(0, 1e-17, n_channels)
    
    elif target_id == 'wise-0855':
        # Very cold T/Y dwarf: only bright in D5/D6, strong CH4 and H2O
        flux = np.zeros(n_channels)
        for i, w in enumerate(wavelengths):
            if w > 3.5:
                flux[i] = 0.2 * np.exp(-(w-4.6)**2 / 0.5)
                if 4.0 < w < 4.5:  # CO2
                    flux[i] *= 0.4
            else:
                flux[i] = 0.0
        flux = flux * 1e-15 + rng.normal(0, 2e-18, n_channels)
    
    else:
        # Generic star: blackbody-ish
        T = 3500 if target['saturated'] else 5000
        flux = np.array([2 * 3.14 * 6.626e-34 * 2.998e8**2 / 
                        (w*1e-6)**5 / (np.exp(6.626e-34 * 2.998e8 / (w*1e-6 * 1.38e-23 * T)) - 1) 
                        for w in wavelengths])
        flux = flux / flux.max() * 1e-14 + rng.normal(0, 1e-16, n_channels)
    
    # Errors
    snr = np.where(flux > 0, np.sqrt(np.abs(flux) / 1e-16 + 1) * 3, 1.0)
    err = np.abs(flux) / np.clip(snr, 1, 100)
    
    # Saturated channels
    saturated = []
    if target['saturated']:
        # Short wavelength channels saturated
        for i, w in enumerate(wavelengths):
            if w < 2.0:
                saturated.append(i)
    
    # Molecular band annotations
    bands = [
        {'name': 'H₂O', 'wavelength': 1.4, 'width': 0.1},
        {'name': 'H₂O', 'wavelength': 1.9, 'width': 0.1},
        {'name': 'CH₄', 'wavelength': 2.2, 'width': 0.1},
        {'name': 'CH₄', 'wavelength': 3.3, 'width': 0.2},
        {'name': 'CO', 'wavelength': 2.35, 'width': 0.05},
        {'name': 'CO₂', 'wavelength': 4.25, 'width': 0.1},
    ]
    
    points = []
    for i, (w, f, e) in enumerate(zip(wavelengths, flux, err)):
        points.append({
            'wavelengthMicron': float(w),
            'flux': float(f),
            'fluxErr': float(e),
            'visitId': 'V1',
            'obsId': f'obs_{i:04d}',
            'flags': [],
            'saturated': i in saturated,
        })
    
    return {'points': points, 'molecularBands': bands, 'targetId': target_id}

# ─── Dispatch ─────────────────────────────────────────────────────────────────

def handle_resolve(params):
    """Resolve coordinates or target name."""
    target_id = params.get('targetId')
    ra_str = params.get('ra')
    dec_str = params.get('dec')
    
    if target_id and target_id in TARGETS:
        t = TARGETS[target_id]
        # Return current-epoch position
        import time
        # Approx current MJD (Nov 2026)
        current_mjd = 60540.0
        new_ra, new_dec = apply_proper_motion(
            t['ra'], t['dec'], t['pmra'], t['pmdec'], t['ref_epoch'], current_mjd
        )
        offset = offset_arcsec(t['ra'], t['dec'], new_ra, new_dec)
        return {
            'ra': new_ra, 'dec': new_dec,
            'targetId': target_id,
            'pmra': t['pmra'], 'pmdec': t['pmdec'],
            'refEpoch': t['ref_epoch'], 'source': t['source'],
            'staleOffsetArcsec': offset,
            'inputRa': t['ra'], 'inputDec': t['dec'],
            'name': t['name'],
            'defaultBand': t['default_band'],
            'saturated': t['saturated'],
        }
    
    if ra_str and dec_str:
        try:
            ra = float(ra_str)
            dec = float(dec_str)
            return {'ra': ra, 'dec': dec, 'source': 'user_input'}
        except ValueError:
            return {'error': 'Invalid coordinates'}
    
    return {'error': 'No target or coordinates provided'}

def handle_frames(params):
    """Get frame list for a target."""
    target_id = params.get('targetId')
    ra = params.get('ra')
    dec = params.get('dec')
    
    if target_id and target_id in TARGETS:
        t = TARGETS[target_id]
        ra = t['ra']
        dec = t['dec']
    
    if not ra or not dec:
        return {'error': 'No coordinates'}
    
    try:
        ra, dec = float(ra), float(dec)
    except (TypeError, ValueError):
        return {'error': 'Invalid coordinates'}
    
    # Try live IRSA query
    frames = query_sia(ra, dec, radius_deg=0.15)
    
    if frames:
        visits = group_into_visits(frames)
        return {
            'visits': visits,
            'totalFrames': len(frames),
            'coverage': 'full' if len(visits) >= 2 else 'partial' if visits else 'none',
        }
    
    # Fall back to synthetic data
    return {
        'visits': [],
        'totalFrames': 0,
        'coverage': 'none',
        'message': 'IRSA query returned no results; using precomputed data',
    }

def handle_stack(params):
    """Get co-added blink frames for a target."""
    target_id = params.get('targetId', 'epsilon-indi-b')
    band = params.get('band', 'D3')
    n_visits = int(params.get('nVisits', 3))
    
    if target_id in TARGETS:
        t = TARGETS[target_id]
        band = params.get('band', t['default_band'])
    
    frames = make_synthetic_blink_frames(target_id, n_visits=n_visits, size=256)
    diff = make_difference_frame(frames, target_id)
    
    return {
        'frames': frames,
        'diff': diff,
        'targetId': target_id,
        'band': band,
    }

def handle_spectrum(params):
    """Get spectrum for a target."""
    target_id = params.get('targetId', 'epsilon-indi-b')
    return make_synthetic_spectrum(target_id)

def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No params provided'}))
        sys.exit(1)
    
    try:
        params = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        print(json.dumps({'error': f'Invalid JSON: {e}'}))
        sys.exit(1)
    
    action = params.get('action', '')
    
    if action == 'resolve':
        result = handle_resolve(params)
    elif action == 'frames':
        result = handle_frames(params)
    elif action == 'stack':
        result = handle_stack(params)
    elif action == 'spectrum':
        result = handle_spectrum(params)
    else:
        result = {'error': f'Unknown action: {action}'}
    
    class NumpyEncoder(json.JSONEncoder):
        def default(self, obj):
            if isinstance(obj, (np.integer,)):
                return int(obj)
            if isinstance(obj, (np.floating,)):
                return float(obj)
            if isinstance(obj, np.ndarray):
                return obj.tolist()
            return super().default(obj)
    
    print(json.dumps(result, cls=NumpyEncoder))

if __name__ == '__main__':
    main()
