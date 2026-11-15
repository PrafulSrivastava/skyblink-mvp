"""Live-fetch test harness backend for SkyBlink (experimental).

Pure core (input validation, the IRSA URL whitelist, SIA CSV parsing, a minimal
FITS image-HDU reader), the retrying IRSA fetch and the Vercel HTTP handler.
Python standard library only, and kept separate
from api/sky.py on purpose: the live harness must not share state or code paths
with the production viewer function.
"""
import csv
import http.client
import io
import json
import math
import os
import re
import statistics
import struct
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler

# --- constants -------------------------------------------------------------
SEARCH_DEADLINE_S = 52
SEARCH_ATTEMPT_TIMEOUT_S = 30
SEARCH_MIN_REMAINING_S = 25
SEARCH_MAX_ATTEMPTS = 6
SEARCH_PAUSE_S = 2.0
SEARCH_MAX_BYTES = 4_000_000

CUTOUT_DEADLINE_S = 50
CUTOUT_ATTEMPT_TIMEOUT_S = 20
CUTOUT_MIN_REMAINING_S = 8
CUTOUT_MAX_ATTEMPTS = 3
CUTOUT_PAUSE_S = 1.5
CUTOUT_PREFIX_BYTES = 262144

CUTOUT_SIZE_DEG = 0.0836
SIA_RADIUS_DEG = 0.001
MAX_EXPOSURES_CAP = 24
DEFAULT_MAX_EXPOSURES = 8
MAX_URL_LEN = 512

BANDS = ("D1", "D2", "D3", "D4", "D5", "D6")
COLLECTIONS = ("dr1", "qr3")

_IRSA_HOST = "irsa.ipac.caltech.edu"
_PATH_RE = re.compile(r"/ibe/data/spherex/(dr1|qr3)/level2/[A-Za-z0-9_.\-/]+\.fits")
_BAND_NAME_RE = re.compile(r"SPHEREx-(D[1-6])")
_MJD_EPOCH = datetime(1858, 11, 17)
_BLOCK = 2880


class BadInput(ValueError):
    pass


class FitsError(ValueError):
    pass


# --- validation ------------------------------------------------------------
def _parse_coord(params, key, lo, hi, hi_inclusive):
    raw = params.get(key)
    if raw is None or str(raw).strip() == "":
        raise BadInput(f"{key} is required")
    try:
        v = float(raw)
    except (TypeError, ValueError):
        raise BadInput(f"{key} must be a number") from None
    if not math.isfinite(v):
        raise BadInput(f"{key} must be finite")
    if v < lo or v > hi or (v == hi and not hi_inclusive):
        bound = f"[{lo:g}, {hi:g}]" if hi_inclusive else f"[{lo:g}, {hi:g})"
        raise BadInput(f"{key} out of range {bound}")
    return v


def validate_search(params):
    ra = _parse_coord(params, "ra", 0.0, 360.0, False)
    dec = _parse_coord(params, "dec", -90.0, 90.0, True)
    collection = str(params.get("collection", "dr1")).strip().lower()
    if collection not in COLLECTIONS:
        raise BadInput("collection must be dr1 or qr3")
    band = str(params.get("band", "")).strip().upper()
    if band not in BANDS:
        raise BadInput("band must be one of D1..D6")
    raw_max = params.get("max")
    if raw_max is None or str(raw_max) == "":
        n = DEFAULT_MAX_EXPOSURES
    else:
        if not re.fullmatch(r"[0-9]{1,3}", str(raw_max).strip()):
            raise BadInput("max must be a whole number")
        n = int(str(raw_max).strip())
        if not 1 <= n <= MAX_EXPOSURES_CAP:
            raise BadInput(f"max must be in 1..{MAX_EXPOSURES_CAP}")
    return {"ra": ra, "dec": dec, "collection": collection, "band": band, "max": n}


def validate_cutout(params):
    ra = _parse_coord(params, "ra", 0.0, 360.0, False)
    dec = _parse_coord(params, "dec", -90.0, 90.0, True)
    url = params.get("url")
    if not isinstance(url, str) or not is_allowed_access_url(url):
        raise BadInput("url is not an allowed IRSA SPHEREx level2 FITS url")
    return {"ra": ra, "dec": dec, "url": url}


def fmt_coord(x):
    s = f"{x:.6f}"
    return "0.000000" if s in ("360.000000", "-0.000000") else s


def is_allowed_access_url(url):
    if not isinstance(url, str) or len(url) > MAX_URL_LEN:
        return False
    if not re.fullmatch(r"[\x21-\x7e]+", url):  # printable ASCII only: urlsplit silently strips \t \r \n
        return False
    try:
        u = urllib.parse.urlsplit(url)
        port = u.port
    except ValueError:
        return False
    if u.scheme != "https" or u.netloc != _IRSA_HOST or u.hostname != _IRSA_HOST:
        return False
    if port is not None or u.username is not None or u.password is not None:
        return False
    if u.query or u.fragment or "?" in url or "#" in url:
        return False
    if not _PATH_RE.fullmatch(u.path):
        return False
    return ".." not in u.path.split("/")


def build_sia_url(ra, dec, collection):
    return (
        "https://irsa.ipac.caltech.edu/SIA?"
        f"COLLECTION=spherex_{collection}"
        f"&POS=circle+{fmt_coord(ra)}+{fmt_coord(dec)}+{SIA_RADIUS_DEG:g}"
        "&RESPONSEFORMAT=csv"
    )


def build_cutout_url(access_url, ra, dec):
    return f"{access_url}?center={fmt_coord(ra)},{fmt_coord(dec)}&size={CUTOUT_SIZE_DEG}"


# --- SIA CSV ---------------------------------------------------------------
def parse_sia_csv(text):
    rows = []
    for r in csv.DictReader(io.StringIO(text)):
        r.pop(None, None)  # data rows with more fields than the header land under None
        r.pop("", None)    # the header's trailing comma names a column ""
        rows.append(r)
    return rows


def mjd_to_iso(mjd):
    return (_MJD_EPOCH + timedelta(days=mjd)).strftime("%Y-%m-%d %H:%M")


def rows_to_exposures(rows, band, collection):
    want = f"SPHEREx-{band}"
    seen = set()
    out = []
    for r in rows:
        if r.get("energy_bandpassname") != want:
            continue
        url = r.get("access_url") or ""
        if not is_allowed_access_url(url):
            continue
        try:
            t_min = float(r["t_min"])
        except (KeyError, TypeError, ValueError):
            continue
        if not math.isfinite(t_min):
            continue
        try:
            date = mjd_to_iso(t_min)
        except (OverflowError, ValueError):
            continue
        key = (r.get("obs_id"), band)
        if key in seen:
            continue
        seen.add(key)
        try:
            size = int(float(r["access_estsize"]))
        except (KeyError, TypeError, ValueError, OverflowError):
            size = None
        out.append({
            "obsId": r.get("obs_id"),
            "band": band,
            "collection": collection,
            "tMin": t_min,
            "date": date,
            "accessUrl": url,
            "estSizeKb": size,
        })
    out.sort(key=lambda e: e["tMin"])
    return out


def band_counts(rows):
    counts = {b: 0 for b in BANDS}
    for r in rows:
        m = _BAND_NAME_RE.fullmatch(r.get("energy_bandpassname") or "")
        if m:
            counts[m.group(1)] += 1
    return counts


def pick_spread(items, n):
    if len(items) <= n:
        return list(items)
    if n == 1:
        return [items[0]]
    last = len(items) - 1
    return [items[round(i * last / (n - 1))] for i in range(n)]


# --- FITS ------------------------------------------------------------------
def round_sig(x, sig=5):
    return float(f"{x:.{sig}g}")


def pixel_stats(pixels):
    vals = [p for p in pixels if p is not None]
    if not vals:
        return {"finite": 0, "min": None, "max": None, "median": None}
    return {"finite": len(vals), "min": min(vals), "max": max(vals), "median": statistics.median(vals)}


def _parse_card(card):
    """Return (keyword, value) for an 80-char card; value is None if the card has no value."""
    key = card[:8].strip()
    if card[8:10] != "= ":
        return key, None
    rest = card[10:].strip()
    if rest.startswith("'"):
        i, s = 1, []
        while i < len(rest):
            if rest[i] == "'":
                if rest[i + 1:i + 2] == "'":
                    s.append("'")
                    i += 2
                    continue
                break
            s.append(rest[i])
            i += 1
        return key, "".join(s).rstrip()
    return key, rest.split("/", 1)[0].strip()


def _read_header(buf, pos):
    """Parse one header at pos; return (cards dict, position after the header blocks)."""
    cards = {}
    while True:
        block = buf[pos:pos + _BLOCK]
        if len(block) < _BLOCK:
            raise FitsError("truncated FITS header")
        pos += _BLOCK
        for i in range(0, _BLOCK, 80):
            card = block[i:i + 80].decode("ascii", "replace")
            key, val = _parse_card(card)
            if key == "END":
                return cards, pos
            if val is not None and key not in cards:
                cards[key] = val


def _int(cards, key, default=None):
    try:
        return int(cards[key])
    except (KeyError, ValueError):
        if default is None:
            raise FitsError(f"missing or invalid {key}") from None
        return default


def _data_size(cards):
    naxis = _int(cards, "NAXIS")
    if naxis < 0:
        raise FitsError("bad NAXIS")
    if naxis == 0:
        return 0
    prod = 1
    for k in range(1, naxis + 1):
        n = _int(cards, f"NAXIS{k}")
        if n < 0:
            raise FitsError("bad axis length")
        prod *= n
    bits = abs(_int(cards, "BITPIX"))
    return (bits // 8) * _int(cards, "GCOUNT", 1) * (_int(cards, "PCOUNT", 0) + prod)


def parse_image_hdu(buf, extname="IMAGE"):
    pos = 0
    while pos < len(buf):
        cards, pos = _read_header(buf, pos)
        size = _data_size(cards)
        if cards.get("EXTNAME", "").strip().upper() == extname.upper():
            return _decode_image(cards, buf[pos:pos + size], size)
        pos += -(-size // _BLOCK) * _BLOCK
    raise FitsError(f"extension {extname} not found")


def _decode_image(cards, data, size):
    bitpix = _int(cards, "BITPIX")
    if bitpix not in (-32, -64):
        raise FitsError(f"unsupported BITPIX {bitpix}")
    if _int(cards, "NAXIS") != 2:
        raise FitsError("image is not 2-D")
    width, height = _int(cards, "NAXIS1"), _int(cards, "NAXIS2")
    if len(data) < size:
        raise FitsError("truncated FITS data")
    n = width * height
    vals = struct.unpack(">" + ("f" if bitpix == -32 else "d") * n, data[:n * (abs(bitpix) // 8)])
    pixels = []
    for r in range(height - 1, -1, -1):  # FITS rows run bottom-up; return top row first
        for v in vals[r * width:(r + 1) * width]:
            pixels.append(round_sig(v) if math.isfinite(v) else None)
    return {"width": width, "height": height, "pixels": pixels, "bunit": cards.get("BUNIT")}


# --- network ---------------------------------------------------------------
_RETRY_STATUSES = frozenset({502, 503, 504})
_USER_AGENT = "SkyBlink-live/0.1"


class UpstreamError(Exception):
    """The IRSA call failed. code: upstream_http | upstream_timeout | upstream_network."""

    def __init__(self, code, status, message):
        super().__init__(message)
        self.code = code
        self.status = status
        self.message = message
        self.attempts = []


class _IrsaOnlyRedirect(urllib.request.HTTPRedirectHandler):
    """Follow redirects only to https://irsa.ipac.caltech.edu (default port): never be bounced to another host."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        try:
            u = urllib.parse.urlsplit(newurl)
            ok = u.scheme == "https" and u.netloc == _IRSA_HOST and u.hostname == _IRSA_HOST
        except ValueError:
            ok = False
        if not ok:
            return None  # urllib then raises HTTPError for the 3xx, which is reported as upstream_http
        return super().redirect_request(req, fp, code, msg, headers, newurl)


# build_opener with no custom HTTPS handler uses the default SSL context: certificates and hostnames are verified.
_URL_OPENER = urllib.request.build_opener(_IrsaOnlyRedirect)


def _http_get(url, timeout, max_bytes):
    """GET url; return (status, body), reading at most max_bytes. Timeouts and network faults raise UpstreamError."""
    req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
    try:
        with _URL_OPENER.open(req, timeout=timeout) as resp:
            return resp.status, resp.read(max_bytes)
    except urllib.error.HTTPError as e:
        try:
            body = e.read(1024)
        except Exception:
            body = b""
        return e.code, body
    except urllib.error.URLError as e:
        if isinstance(e.reason, TimeoutError):
            raise UpstreamError("upstream_timeout", None, "timed out") from None
        raise UpstreamError("upstream_network", None, f"network error: {type(e.reason).__name__}") from None
    except TimeoutError:  # socket.timeout is TimeoutError on Python 3.10+
        raise UpstreamError("upstream_timeout", None, "timed out") from None
    except (OSError, http.client.HTTPException) as e:
        raise UpstreamError("upstream_network", None, f"network error: {type(e).__name__}") from None


def fetch_with_retry(url, *, attempt_timeout_s, deadline_s, min_remaining_s, max_attempts, pause_s, max_bytes,
                     opener=None, sleep=time.sleep, clock=time.monotonic):
    """GET url with bounded retries. Return (body, attempts) on 200, else raise UpstreamError (with .attempts)."""
    if opener is None:
        def opener(u, t):
            return _http_get(u, t, max_bytes)
    start = clock()
    attempts = []
    while True:
        n = len(attempts) + 1
        timeout = min(attempt_timeout_s, deadline_s - (clock() - start))
        t0 = clock()
        body = None
        try:
            status, body = opener(url, timeout)
            err = None if status == 200 else UpstreamError("upstream_http", status, f"HTTP {status}")
        except UpstreamError as e:
            status, err = e.status, e
        attempts.append({"n": n, "status": status, "ms": int(round((clock() - t0) * 1000)),
                         "error": None if err is None else err.message})
        if err is None:
            return body, attempts
        retryable = err.code in ("upstream_timeout", "upstream_network") or status in _RETRY_STATUSES
        remaining_after_pause = deadline_s - (clock() - start) - pause_s
        if retryable and n < max_attempts and remaining_after_pause >= min_remaining_s:
            sleep(pause_s)
            continue
        err.attempts = attempts
        raise err


# --- handlers --------------------------------------------------------------
_HTTP_FOR_CODE = {
    "bad_input": 400,
    "upstream_http": 502,
    "upstream_network": 502,
    "upstream_timeout": 504,
    "bad_fits": 502,
    "internal": 500,
}


def _failure(action, code, message, started, clock, attempts=None, upstream_status=None):
    body = {
        "ok": False,
        "action": action,
        "elapsedMs": int(round((clock() - started) * 1000)),
        "attempts": attempts or [],
        "error": {"code": code, "message": message, "upstreamStatus": upstream_status},
    }
    return _HTTP_FOR_CODE[code], body


def _snippet(body):
    """First 80 printable ASCII characters of an upstream body, for error messages."""
    return re.sub(r"[^\x20-\x7e]", "", body.decode("latin-1"))[:80]


def _search(params, opener, sleep, clock, started):
    q = validate_search(params)
    body, attempts = fetch_with_retry(
        build_sia_url(q["ra"], q["dec"], q["collection"]),
        attempt_timeout_s=SEARCH_ATTEMPT_TIMEOUT_S, deadline_s=SEARCH_DEADLINE_S,
        min_remaining_s=SEARCH_MIN_REMAINING_S, max_attempts=SEARCH_MAX_ATTEMPTS,
        pause_s=SEARCH_PAUSE_S, max_bytes=SEARCH_MAX_BYTES, opener=opener, sleep=sleep, clock=clock)
    text = body.decode("utf-8", "replace")
    rows = parse_sia_csv(text)
    if not rows and "access_url" not in text.split("\n", 1)[0]:
        # a 200 that is not the SIA table (HTML error page, VOTable error): do not report it as "zero rows"
        return _failure("search", "bad_fits", "IRSA search reply was not the expected CSV table: " + _snippet(body),
                        started, clock, attempts)
    all_exposures = rows_to_exposures(rows, q["band"], q["collection"])
    return 200, {
        "ok": True,
        "action": "search",
        "query": q,
        "elapsedMs": int(round((clock() - started) * 1000)),
        "attempts": attempts,
        "totalRows": len(rows),
        "bandCounts": band_counts(rows),
        "bandRows": len(all_exposures),
        "truncated": len(all_exposures) > q["max"],
        "exposures": pick_spread(all_exposures, q["max"]),
    }


def _cutout(params, opener, sleep, clock, started):
    q = validate_cutout(params)
    body, attempts = fetch_with_retry(
        build_cutout_url(q["url"], q["ra"], q["dec"]),
        attempt_timeout_s=CUTOUT_ATTEMPT_TIMEOUT_S, deadline_s=CUTOUT_DEADLINE_S,
        min_remaining_s=CUTOUT_MIN_REMAINING_S, max_attempts=CUTOUT_MAX_ATTEMPTS,
        pause_s=CUTOUT_PAUSE_S, max_bytes=CUTOUT_PREFIX_BYTES, opener=opener, sleep=sleep, clock=clock)
    try:
        img = parse_image_hdu(body)
    except FitsError as e:
        return _failure("cutout", "bad_fits", f"IRSA reply was not a readable FITS image ({e}). Body starts: {_snippet(body)}",
                        started, clock, attempts)
    return 200, {
        "ok": True,
        "action": "cutout",
        "elapsedMs": int(round((clock() - started) * 1000)),
        "attempts": attempts,
        "bytesRead": len(body),
        "width": img["width"],
        "height": img["height"],
        "bunit": img["bunit"],
        "pixels": img["pixels"],
        **pixel_stats(img["pixels"]),
    }


def handle(params, *, opener=None, sleep=time.sleep, clock=time.monotonic):
    """Dispatch one request. Return (http_status, json_body). Validation runs before any network call."""
    started = clock()
    action = params.get("action")
    if action not in ("search", "cutout"):
        return _failure(None, "bad_input", "action must be search or cutout", started, clock)
    try:
        run = _search if action == "search" else _cutout
        return run(params, opener, sleep, clock, started)
    except BadInput as e:
        return _failure(action, "bad_input", str(e), started, clock)
    except UpstreamError as e:
        return _failure(action, e.code, e.message, started, clock, e.attempts, e.status)


# --- Vercel entry point ----------------------------------------------------
class handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = b"" if body is None else json.dumps(body, allow_nan=False).encode("utf-8")
        self.send_response(code)
        if body is not None:
            self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        if os.environ.get("LIVE_DEV_CORS") == "1":
            self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        try:
            query = urllib.parse.urlsplit(self.path).query
            params = {k: v[0] for k, v in urllib.parse.parse_qs(query, keep_blank_values=True).items()}
            code, body = handle(params)
            self._send(code, body)
        except Exception:
            # no traceback or exception text in the response body
            self._send(500, {"ok": False, "action": None, "elapsedMs": 0, "attempts": [],
                             "error": {"code": "internal", "message": "internal error", "upstreamStatus": None}})

    def do_OPTIONS(self):
        self._send(204, None)
