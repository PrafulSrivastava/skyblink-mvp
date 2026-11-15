import importlib.util
import io
from pathlib import Path

import numpy as np
import pytest
from astropy.io import fits

_spec = importlib.util.spec_from_file_location(
    "live_api", Path(__file__).resolve().parents[3] / "api" / "live.py"
)
live = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(live)

GOOD_DR1 = "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2025W19_1B/l2b-v27-2026-197/3/level2_2025W19_1B_0116_1D3_spx_l2b-v27-2026-197.fits"
GOOD_QR3 = "https://irsa.ipac.caltech.edu/ibe/data/spherex/qr3/level2/2026W33_2A/l2b-v27-2026-241/3/level2_2026W33_2A_0594_4D3_spx_l2b-v27-2026-241.fits"
GOOD_DR1_D6 = GOOD_DR1.replace("1D3", "1D6").replace("/3/", "/6/")
GOOD_DR1_D6_B = GOOD_DR1_D6.replace("2025W19_1B_0116", "2024W40_1A_0010")

# Subset of the IRSA SIA columns. The header ends with a trailing comma (an unnamed "" column) and each data row
# carries one more field than the header, so DictReader puts the extra field under a None key, as in the real response.
CSV = (
    "obs_id,energy_bandpassname,t_min,access_url,access_estsize,s_ra,s_dec,\n"
    f"2025W19_1B_0116_1,SPHEREx-D3,60800.700028,{GOOD_DR1},62000,133.76,-7.24,x,\n"
    f"2025W19_1B_0116_1,SPHEREx-D6,60800.700028,{GOOD_DR1_D6},62001,133.76,-7.24,x,\n"
    f"2024W40_1A_0010_1,SPHEREx-D6,60500.1,{GOOD_DR1_D6_B},61999,133.76,-7.24,x,\n"
    "2025W20_1B_0001_1,SPHEREx-D6,60810.5,https://evil.example/x.fits,62000,133.76,-7.24,x,\n"
)


def test_parse_sia_csv_drops_trailing_none_key():
    rows = live.parse_sia_csv(CSV)
    assert len(rows) == 4 and None not in rows[0] and "" not in rows[0]
    assert rows[0]["energy_bandpassname"] == "SPHEREx-D3"


def test_parse_sia_csv_header_only():
    assert live.parse_sia_csv(CSV.splitlines()[0] + "\n") == []


def test_rows_to_exposures_filters_band_and_sorts():
    ex = live.rows_to_exposures(live.parse_sia_csv(CSV), "D6", "dr1")
    assert [e["tMin"] for e in ex] == [60500.1, 60800.700028]   # evil url dropped, sorted
    assert ex[1]["obsId"] == "2025W19_1B_0116_1" and ex[1]["band"] == "D6"
    assert ex[1]["date"] == "2025-05-05 16:48" and ex[1]["collection"] == "dr1"
    assert ex[1]["estSizeKb"] == 62001 and ex[1]["accessUrl"] == GOOD_DR1_D6


def test_rows_to_exposures_dedupes_on_obs_and_band():
    rows = live.parse_sia_csv(CSV)
    ex = live.rows_to_exposures(rows + [rows[1]], "D6", "dr1")
    assert len(ex) == 2


def test_rows_to_exposures_skips_absurd_t_min():
    rows = live.parse_sia_csv(CSV)
    rows[2] = {**rows[2], "t_min": "1e12"}
    ex = live.rows_to_exposures(rows, "D6", "dr1")
    assert [e["tMin"] for e in ex] == [60800.700028]


def test_band_counts_has_all_bands():
    assert live.band_counts(live.parse_sia_csv(CSV)) == {"D1": 0, "D2": 0, "D3": 1, "D4": 0, "D5": 0, "D6": 3}


def test_pick_spread():
    assert live.pick_spread(list(range(10)), 4) == [0, 3, 6, 9]
    assert live.pick_spread([1, 2], 8) == [1, 2]
    assert live.pick_spread([5, 6, 7], 1) == [5]


def test_mjd_to_iso():
    assert live.mjd_to_iso(61268.630812) == "2026-08-16 15:08"


@pytest.mark.parametrize("ra,dec", [("360", "0"), ("-0.1", "0"), ("0", "90.0001"), ("0", "-91"), ("nan", "0"), ("inf", "0"), ("", "0"), ("abc", "0")])
def test_validate_rejects_bad_coords(ra, dec):
    with pytest.raises(live.BadInput):
        live.validate_search({"ra": ra, "dec": dec, "collection": "dr1", "band": "D6"})


def test_validate_rejects_missing_coords():
    with pytest.raises(live.BadInput):
        live.validate_search({"collection": "dr1", "band": "D6"})


def test_validate_accepts_poles_and_defaults():
    v = live.validate_search({"ra": "359.9999", "dec": "-90", "collection": "QR3", "band": "d2"})
    assert v == {"ra": 359.9999, "dec": -90.0, "collection": "qr3", "band": "D2", "max": 8}


@pytest.mark.parametrize("bad", [{"band": "D7"}, {"collection": "dr2"}, {"max": "0"}, {"max": "25"}, {"max": "3.5"}])
def test_validate_rejects_bad_options(bad):
    p = {"ra": "10", "dec": "10", "collection": "dr1", "band": "D1", **bad}
    with pytest.raises(live.BadInput):
        live.validate_search(p)


def test_fmt_coord_wraps_360():
    assert live.fmt_coord(359.99999999) == "0.000000"
    assert live.fmt_coord(-7.2412971) == "-7.241297"


@pytest.mark.parametrize("url", [GOOD_DR1, GOOD_QR3])
def test_whitelist_accepts_irsa(url):
    assert live.is_allowed_access_url(url)


@pytest.mark.parametrize("url", [
    GOOD_DR1.replace("https", "http", 1),
    GOOD_DR1.replace("irsa.ipac.caltech.edu", "irsa.ipac.caltech.edu.evil.com"),
    GOOD_DR1.replace("https://", "https://evil@"),
    GOOD_DR1.replace("caltech.edu/", "caltech.edu:8443/"),
    GOOD_DR1 + "?center=1,1",
    GOOD_DR1 + "#x",
    GOOD_DR1 + "?",
    GOOD_DR1 + "\n",
    GOOD_DR1.replace("/level2/", "/level2/a\n/"),
    GOOD_DR1.replace("/level2/", "/level2/a\t/"),
    GOOD_DR1.replace("/level2/", "/level2/a\r/"),
    GOOD_DR1.replace("/level2/", "/level2/%2e%2e/"),
    GOOD_DR1.replace("irsa.ipac.caltech.edu", "IRSA.IPAC.CALTECH.EDU"),
    GOOD_DR1.replace("https://irsa.ipac.caltech.edu/", "https://irsa.ipac.caltech.edu@evil.com/"),
    GOOD_DR1.replace("/level2/", "/level2/../../../"),
    GOOD_DR1.replace("spherex/dr1", "spherex/dr2"),
    GOOD_DR1[:-5] + ".txt",
    "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/" + "a" * 600 + ".fits",
    "file:///etc/passwd",
])
def test_whitelist_rejects(url):
    assert not live.is_allowed_access_url(url)


def test_validate_cutout_rejects_foreign_url():
    with pytest.raises(live.BadInput):
        live.validate_cutout({"ra": "1", "dec": "1", "url": "https://example.com/a.fits"})


def test_validate_cutout_accepts_good():
    v = live.validate_cutout({"ra": "1", "dec": "-1", "url": GOOD_DR1})
    assert v == {"ra": 1.0, "dec": -1.0, "url": GOOD_DR1}


def test_build_urls():
    assert live.build_cutout_url(GOOD_DR1, 133.7601588, -7.2412971) == GOOD_DR1 + "?center=133.760159,-7.241297&size=0.12"
    u = live.build_sia_url(133.7601588, -7.2412971, "qr3")
    assert u.startswith("https://irsa.ipac.caltech.edu/SIA?") and "COLLECTION=spherex_qr3" in u
    assert "RESPONSEFORMAT=csv" in u and "0.001" in u


def _mef(image: np.ndarray, wcs_cards=None) -> bytes:
    img = fits.ImageHDU(image.astype(">f4"), name="IMAGE")
    img.header["BUNIT"] = "MJy / sr"
    for k, v in (wcs_cards or {}).items():
        img.header[k] = v
    img.header["COMMENT2"] = "a/b"
    tbl = fits.BinTableHDU.from_columns(
        [fits.Column(name="X", format="E", array=np.arange(10, dtype=np.float32))], name="EPSF"
    )
    hdul = fits.HDUList([
        fits.PrimaryHDU(),
        img,
        fits.ImageHDU(np.zeros((49, 49), np.int32), name="FLAGS"),
        tbl,
    ])
    bio = io.BytesIO()
    hdul.writeto(bio)
    return bio.getvalue()


def test_parse_image_hdu_flips_rows_and_maps_nan():
    img = np.arange(49 * 49, dtype=np.float32).reshape(49, 49)
    img[0, 0] = np.nan            # FITS bottom-left
    out = live.parse_image_hdu(_mef(img))
    assert (out["width"], out["height"], out["bunit"]) == (49, 49, "MJy / sr")
    assert len(out["pixels"]) == 2401
    assert out["pixels"][48 * 49 + 0] is None          # bottom row is last
    assert out["pixels"][2] == float(48 * 49 + 2)      # FITS top row (index 48) is first


SPHEREX_WCS = {
    "CTYPE1": "RA---TAN-SIP", "CTYPE2": "DEC--TAN-SIP", "CRPIX1": -116.5, "CRPIX2": -927.5,
    "CRVAL1": 269.236070549, "CRVAL2": 6.40102765807, "CDELT1": 1.0, "CDELT2": 1.0,
    "PC1_1": 0.00170227082786, "PC1_2": -3.36422975169e-05, "PC2_1": -3.44705144342e-05, "PC2_2": -0.00170668970143,
    "LONPOLE": 180.0, "A_ORDER": 3, "A_0_0": -0.110309104245, "A_1_0": 0.000418630318125,
    "B_ORDER": 3, "B_0_0": -0.893081814522, "B_2_0": 6.54942093687e-06,
    "AP_ORDER": 3, "AP_0_0": 0.110382318042, "CRPIX1A": -1136.0, "CTYPE1A": "LINEAR",
}


def test_parse_image_hdu_returns_wcs():
    out = live.parse_image_hdu(_mef(np.ones((49, 49), np.float32), SPHEREX_WCS))
    w = out["wcs"]
    assert w["CTYPE1"] == "RA---TAN-SIP" and w["CTYPE2"] == "DEC--TAN-SIP"
    assert w["CRPIX1"] == -116.5 and w["CRVAL2"] == 6.40102765807 and w["PC2_2"] == -0.00170668970143
    assert w["A_ORDER"] == 3 and w["B_2_0"] == 6.54942093687e-06 and w["A_0_0"] == -0.110309104245
    # inverse SIP, alternate WCS and other keywords are left out
    assert not any(k.startswith(("AP_", "BP_")) for k in w)
    assert "BUNIT" not in w and "CRPIX1A" not in w and "CTYPE1A" not in w
    assert all(isinstance(v, float) for k, v in w.items() if not k.startswith("CTYPE"))


def test_extract_wcs_needs_a_celestial_tan_projection():
    assert live.parse_image_hdu(_mef(np.ones((4, 4), np.float32)))["wcs"] is None
    assert live.extract_wcs({**{k: str(v) for k, v in SPHEREX_WCS.items()}, "CTYPE1": "GLON-TAN"}) is None
    no_ref = {k: str(v) for k, v in SPHEREX_WCS.items() if k != "CRVAL1"}
    assert live.extract_wcs(no_ref) is None
    no_scale = {k: str(v) for k, v in SPHEREX_WCS.items() if not k.startswith(("CDELT", "PC"))}
    assert live.extract_wcs(no_scale) is None
    cd_only = {**no_scale, "CD1_1": "1.7D-03", "CD1_2": "0", "CD2_1": "0", "CD2_2": "-1.7E-03"}
    assert live.extract_wcs(cd_only)["CD1_1"] == 1.7e-03
    assert live.extract_wcs({**cd_only, "CRPIX1": "nan"}) is None


def test_cutout_response_carries_wcs():
    body = _mef(np.ones((49, 49), np.float32), SPHEREX_WCS)
    code, out = live.handle({"action": "cutout", "ra": "269.4", "dec": "4.7", "url": GOOD_DR1},
                            opener=lambda url, timeout: (200, body), sleep=lambda s: None)
    assert code == 200 and out["ok"] and out["wcs"]["CTYPE1"] == "RA---TAN-SIP"
    json.dumps(out, allow_nan=False)


def test_parse_image_hdu_truncated_raises():
    buf = _mef(np.ones((49, 49), np.float32))
    with pytest.raises(live.FitsError):
        live.parse_image_hdu(buf[:2880 * 2 + 100])


def test_parse_image_hdu_missing_ext_raises():
    with pytest.raises(live.FitsError):
        live.parse_image_hdu(_mef(np.ones((49, 49), np.float32)), extname="NOPE")


def test_parse_image_hdu_works_from_prefix():
    buf = _mef(np.ones((49, 49), np.float32))
    assert live.parse_image_hdu(buf[:live.CUTOUT_PREFIX_BYTES])["width"] == 49


def test_parse_image_hdu_rejects_unsupported_bitpix():
    bio = io.BytesIO()
    fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(np.zeros((4, 4), np.int16), name="IMAGE")]).writeto(bio)
    with pytest.raises(live.FitsError):
        live.parse_image_hdu(bio.getvalue())


def test_parse_image_hdu_rounds_to_5_sig():
    img = np.full((49, 49), 1.23456789, np.float32)
    assert live.parse_image_hdu(_mef(img))["pixels"][0] == 1.2346


def test_pixel_stats_all_nan():
    assert live.pixel_stats([None] * 2401) == {"finite": 0, "min": None, "max": None, "median": None}


def test_pixel_stats_values():
    assert live.pixel_stats([1.0, None, 3.0, 2.0]) == {"finite": 3, "min": 1.0, "max": 3.0, "median": 2.0}


# --- network layer, retries and handler (Task 2) ---------------------------
import http.client
import json
import socket
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

SEARCH_PARAMS = {"action": "search", "ra": "133.7601588", "dec": "-7.2412971", "collection": "dr1", "band": "D6", "max": "8"}


class FakeClock:
    def __init__(self):
        self.t = 0.0

    def now(self):
        return self.t

    def sleep(self, s):
        self.t += s


class FakeOpener:
    """Pops scripted responses (or raises scripted exceptions); records (url, timeout); advances the fake clock."""

    def __init__(self, script, ms_per_call=0):
        self.script = list(script)
        self.calls = []
        self.clock = FakeClock()
        self.ms = ms_per_call

    def __call__(self, url, timeout):
        self.calls.append((url, timeout))
        self.clock.t += self.ms / 1000.0
        item = self.script.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def test_search_retries_502_then_succeeds():
    op = FakeOpener([(502, b"Proxy Error"), (502, b"Proxy Error"), (200, CSV.encode())], ms_per_call=900)
    code, body = live.handle(SEARCH_PARAMS, opener=op, sleep=op.clock.sleep, clock=op.clock.now)
    assert code == 200 and body["ok"] and [a["status"] for a in body["attempts"]] == [502, 502, 200]
    assert body["bandCounts"]["D6"] == 3 and len(body["exposures"]) == 2


def test_search_502_storm_gives_up_after_max_attempts():
    op = FakeOpener([(502, b"x")] * 10, ms_per_call=900)
    code, body = live.handle(SEARCH_PARAMS, opener=op, sleep=op.clock.sleep, clock=op.clock.now)
    assert code == 502 and body["error"]["code"] == "upstream_http" and body["error"]["upstreamStatus"] == 502
    assert len(body["attempts"]) == live.SEARCH_MAX_ATTEMPTS


def test_search_does_not_retry_when_deadline_too_close():
    # first attempt times out after 30 s: 52-30-2 < 25 so no second attempt
    op = FakeOpener([live.UpstreamError("upstream_timeout", None, "timed out")] * 3, ms_per_call=30000)
    code, body = live.handle(SEARCH_PARAMS, opener=op, sleep=op.clock.sleep, clock=op.clock.now)
    assert code == 504 and len(body["attempts"]) == 1


def test_search_404_not_retried():
    op = FakeOpener([(404, b"nope")])
    code, body = live.handle(SEARCH_PARAMS, opener=op, sleep=op.clock.sleep, clock=op.clock.now)
    assert code == 502 and len(body["attempts"]) == 1 and body["error"]["upstreamStatus"] == 404


def test_search_zero_rows_is_ok():
    op = FakeOpener([(200, (CSV.splitlines()[0] + "\n").encode())])
    code, body = live.handle(SEARCH_PARAMS, opener=op, sleep=op.clock.sleep, clock=op.clock.now)
    assert code == 200 and body["totalRows"] == 0 and body["exposures"] == [] and body["truncated"] is False


def test_bad_input_makes_no_network_call():
    op = FakeOpener([])
    code, body = live.handle({**SEARCH_PARAMS, "dec": "95"}, opener=op)
    assert code == 400 and body["error"]["code"] == "bad_input" and op.calls == []
    code, body = live.handle({"action": "cutout", "ra": "1", "dec": "1", "url": "https://example.com/a.fits"}, opener=op)
    assert code == 400 and op.calls == []
    assert live.handle({"action": "frames"}, opener=op)[0] == 400


def test_cutout_retries_503_and_parses():
    op = FakeOpener([(503, b"busy"), (200, _mef(np.ones((49, 49), np.float32)))], ms_per_call=3000)
    code, body = live.handle({"action": "cutout", "ra": "133.7601588", "dec": "-7.2412971", "url": GOOD_DR1},
                             opener=op, sleep=op.clock.sleep, clock=op.clock.now)
    assert code == 200 and body["width"] == 49 and body["finite"] == 2401 and len(body["attempts"]) == 2
    assert op.calls[0][0] == GOOD_DR1 + "?center=133.760159,-7.241297&size=0.12"


def test_cutout_html_body_is_bad_fits():
    op = FakeOpener([(200, b"<html>error</html>")])
    code, body = live.handle({"action": "cutout", "ra": "1", "dec": "1", "url": GOOD_DR1}, opener=op)
    assert code == 502 and body["error"]["code"] == "bad_fits" and "<html>" in body["error"]["message"]


# extra coverage beyond the brief's list
def test_search_response_shape_and_truncation():
    op = FakeOpener([(200, CSV.encode())], ms_per_call=1500)
    code, body = live.handle({**SEARCH_PARAMS, "max": "1"}, opener=op, sleep=op.clock.sleep, clock=op.clock.now)
    assert code == 200 and body["action"] == "search" and body["elapsedMs"] == 1500
    assert body["query"] == {"ra": 133.7601588, "dec": -7.2412971, "collection": "dr1", "band": "D6", "max": 1}
    assert body["totalRows"] == 4 and body["bandRows"] == 2 and body["truncated"] is True
    assert [e["tMin"] for e in body["exposures"]] == [60500.1]
    assert body["attempts"] == [{"n": 1, "status": 200, "ms": 1500, "error": None}]
    assert op.calls[0][0] == live.build_sia_url(133.7601588, -7.2412971, "dr1")
    json.dumps(body, allow_nan=False)


def test_search_non_csv_200_is_not_silently_zero_rows():
    op = FakeOpener([(200, b"<html><body>Proxy glitch</body></html>")])
    code, body = live.handle(SEARCH_PARAMS, opener=op)
    assert code == 502 and body["error"]["code"] == "bad_fits" and "Proxy glitch" in body["error"]["message"]


def test_cutout_all_nan_and_response_is_json_safe():
    op = FakeOpener([(200, _mef(np.full((49, 49), np.nan, np.float32)))])
    code, body = live.handle({"action": "cutout", "ra": "1", "dec": "1", "url": GOOD_DR1}, opener=op)
    assert code == 200 and body["finite"] == 0 and body["min"] is None and body["median"] is None
    assert body["pixels"] == [None] * 2401 and body["bytesRead"] > 0
    json.dumps(body, allow_nan=False)


def test_fetch_retries_network_error_and_caps_timeout_to_remaining():
    op = FakeOpener([live.UpstreamError("upstream_network", None, "refused"), (200, b"ok")], ms_per_call=1000)
    data, att = live.fetch_with_retry("https://x", attempt_timeout_s=30, deadline_s=52, min_remaining_s=25,
                                      max_attempts=6, pause_s=2.0, max_bytes=10,
                                      opener=op, sleep=op.clock.sleep, clock=op.clock.now)
    assert data == b"ok" and [a["status"] for a in att] == [None, 200] and att[0]["error"] == "refused"
    assert op.calls[0][1] == 30 and op.calls[1][1] == 30   # 52-1-2=49 remaining at attempt 2, capped to 30
    op = FakeOpener([live.UpstreamError("upstream_network", None, "refused"), (200, b"ok")], ms_per_call=25000)
    live.fetch_with_retry("https://x", attempt_timeout_s=30, deadline_s=52, min_remaining_s=8,
                          max_attempts=6, pause_s=2.0, max_bytes=10, opener=op, sleep=op.clock.sleep, clock=op.clock.now)
    assert op.calls[1][1] == pytest.approx(52 - 25 - 2)    # remaining time beats attempt_timeout_s


def test_fetch_error_carries_attempts():
    op = FakeOpener([(504, b"x")] * 3)
    with pytest.raises(live.UpstreamError) as ei:
        live.fetch_with_retry("https://x", attempt_timeout_s=20, deadline_s=50, min_remaining_s=8,
                              max_attempts=3, pause_s=1.5, max_bytes=10,
                              opener=op, sleep=op.clock.sleep, clock=op.clock.now)
    assert ei.value.code == "upstream_http" and ei.value.status == 504 and len(ei.value.attempts) == 3


class _Resp:
    def __init__(self, status=200, data=b"x" * 100):
        self.status, self.data, self.asked = status, data, None

    def read(self, n=-1):
        self.asked = n
        return self.data[:n]

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class _FakeUrlOpener:
    def __init__(self, result):
        self.result, self.reqs = result, []

    def open(self, req, timeout=None):
        self.reqs.append((req, timeout))
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


def test_default_opener_sets_ua_reads_at_most_max_bytes(monkeypatch):
    resp = _Resp()
    fake = _FakeUrlOpener(resp)
    monkeypatch.setattr(live, "_URL_OPENER", fake)
    assert live._http_get("https://irsa.ipac.caltech.edu/x", 7.5, 10) == (200, b"x" * 10)
    assert resp.asked == 10
    req, timeout = fake.reqs[0]
    assert req.get_header("User-agent") == "SkyBlink-live/0.1" and timeout == 7.5


@pytest.mark.parametrize("exc,code", [
    (socket.timeout("t"), "upstream_timeout"),
    (TimeoutError("t"), "upstream_timeout"),
    (urllib.error.URLError(socket.timeout("t")), "upstream_timeout"),
    (urllib.error.URLError(ConnectionRefusedError("no")), "upstream_network"),
    (http.client.IncompleteRead(b"x"), "upstream_network"),
])
def test_default_opener_maps_errors(monkeypatch, exc, code):
    monkeypatch.setattr(live, "_URL_OPENER", _FakeUrlOpener(exc))
    with pytest.raises(live.UpstreamError) as ei:
        live._http_get("https://irsa.ipac.caltech.edu/x", 5, 10)
    assert ei.value.code == code


def test_default_opener_maps_http_error_to_status(monkeypatch):
    err = urllib.error.HTTPError("https://irsa.ipac.caltech.edu/x", 502, "Bad Gateway", {}, io.BytesIO(b"Proxy Error"))
    monkeypatch.setattr(live, "_URL_OPENER", _FakeUrlOpener(err))
    assert live._http_get("https://irsa.ipac.caltech.edu/x", 5, 10)[0] == 502


def test_redirects_only_stay_on_irsa_https():
    h = live._IrsaOnlyRedirect()
    req = urllib.request.Request("https://irsa.ipac.caltech.edu/a")
    ok = h.redirect_request(req, None, 302, "Found", {}, "https://irsa.ipac.caltech.edu/b")
    assert ok is not None and ok.full_url == "https://irsa.ipac.caltech.edu/b"
    for bad in ("https://evil.example/b", "http://irsa.ipac.caltech.edu/b", "https://irsa.ipac.caltech.edu.evil.example/b",
                "https://irsa.ipac.caltech.edu@evil.example/b", "https://irsa.ipac.caltech.edu:8443/b"):
        assert h.redirect_request(req, None, 302, "Found", {}, bad) is None


def test_no_unverified_ssl_in_source():
    src = (Path(__file__).resolve().parents[3] / "api" / "live.py").read_text(encoding="utf-8")
    for needle in ("_create_unverified_context", "verify=False", "CERT_NONE", "check_hostname"):
        assert needle not in src


@pytest.fixture
def server(monkeypatch):
    monkeypatch.setenv("LIVE_DEV_CORS", "1")
    srv = ThreadingHTTPServer(("127.0.0.1", 0), live.handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    yield srv.server_address[1]
    srv.shutdown()
    srv.server_close()


def _get(port, path, method="GET"):
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    c.request(method, path)
    r = c.getresponse()
    data = r.read()
    out = (r.status, dict(r.getheaders()), data)
    c.close()
    return out


def test_handler_bad_input_json_headers_and_cors(server):
    status, hdr, data = _get(server, "/api/live/?action=search&ra=400&dec=0&collection=dr1&band=D1")
    body = json.loads(data)
    assert status == 400 and body["error"]["code"] == "bad_input" and body["ok"] is False and body["attempts"] == []
    assert hdr["Content-Type"].startswith("application/json") and hdr["Cache-Control"] == "no-store"
    assert hdr["Access-Control-Allow-Origin"] == "*"


def test_handler_cors_header_off_by_default(server, monkeypatch):
    monkeypatch.delenv("LIVE_DEV_CORS")
    status, hdr, _ = _get(server, "/api/live?action=nope")
    assert status == 400 and "Access-Control-Allow-Origin" not in hdr


def test_handler_options_and_no_post(server, monkeypatch):
    status, hdr, data = _get(server, "/api/live/", "OPTIONS")
    assert status == 204 and data == b"" and hdr["Access-Control-Allow-Origin"] == "*"
    monkeypatch.delenv("LIVE_DEV_CORS")
    assert "Access-Control-Allow-Origin" not in _get(server, "/api/live/", "OPTIONS")[1]
    assert _get(server, "/api/live/", "POST")[0] in (404, 405, 501)


def test_handler_uncaught_exception_is_500_without_traceback(server, monkeypatch):
    def boom(params, **kw):
        raise RuntimeError("secret detail at /home/x/live.py")
    monkeypatch.setattr(live, "handle", boom)
    status, _, data = _get(server, "/api/live/?action=search")
    body = json.loads(data)
    assert status == 500 and body["ok"] is False and body["error"]["code"] == "internal"
    assert "secret" not in data.decode() and "Traceback" not in data.decode()
