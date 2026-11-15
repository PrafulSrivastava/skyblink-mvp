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

# Header column set follows the IRSA SIA CSV (subset); like the real one it ends with a trailing comma.
CSV = (
    "obs_id,energy_bandpassname,t_min,access_url,access_estsize,s_ra,s_dec,\n"
    f"2025W19_1B_0116_1,SPHEREx-D3,60800.700028,{GOOD_DR1},62000,133.76,-7.24,\n"
    f"2025W19_1B_0116_1,SPHEREx-D6,60800.700028,{GOOD_DR1_D6},62001,133.76,-7.24,\n"
    f"2024W40_1A_0010_1,SPHEREx-D6,60500.1,{GOOD_DR1_D6_B},61999,133.76,-7.24,\n"
    "2025W20_1B_0001_1,SPHEREx-D6,60810.5,https://evil.example/x.fits,62000,133.76,-7.24,\n"
)


def test_parse_sia_csv_drops_trailing_none_key():
    rows = live.parse_sia_csv(CSV)
    assert len(rows) == 4 and None not in rows[0]
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
    assert live.build_cutout_url(GOOD_DR1, 133.7601588, -7.2412971) == GOOD_DR1 + "?center=133.760159,-7.241297&size=0.0836"
    u = live.build_sia_url(133.7601588, -7.2412971, "qr3")
    assert u.startswith("https://irsa.ipac.caltech.edu/SIA?") and "COLLECTION=spherex_qr3" in u
    assert "RESPONSEFORMAT=csv" in u and "0.001" in u


def _mef(image: np.ndarray) -> bytes:
    img = fits.ImageHDU(image.astype(">f4"), name="IMAGE")
    img.header["BUNIT"] = "MJy / sr"
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
