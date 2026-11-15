import json

import numpy as np
import pytest

from config import DATA_DIR, PATCHES
from geometry import MJD_PER_YEAR, grid_wcs, png_to_radec, propagate, radec_to_png, sep_arcsec


def _target(patch):
    return json.loads((DATA_DIR / patch / "target.json").read_text())


@pytest.mark.parametrize("patch", PATCHES)
def test_center_pixel(patch):  # every real patch
    g = _target(patch)["grid"]
    assert radec_to_png(g, g["CRVAL1"], g["CRVAL2"]) == pytest.approx((24.0, 24.0), abs=1e-9)


def test_roundtrip():
    g = _target("barnards-star")["grid"]
    rng = np.random.default_rng(7)
    x, y = rng.uniform(0, 48, 50), rng.uniform(0, 48, 50)
    assert np.allclose(radec_to_png(g, *png_to_radec(g, x, y)), (x, y), atol=1e-6)


def test_scalar_in_scalar_out():
    g = _target("barnards-star")["grid"]
    x, y = radec_to_png(g, g["CRVAL1"], g["CRVAL2"])
    assert isinstance(x, float) and isinstance(y, float)
    ra, dec = png_to_radec(g, 24.0, 24.0)
    assert isinstance(ra, float) and isinstance(dec, float)


def test_east_left_north_up():
    g = _target("barnards-star")["grid"]
    x1, _ = radec_to_png(g, g["CRVAL1"] + 0.003, g["CRVAL2"])
    _, y2 = radec_to_png(g, g["CRVAL1"], g["CRVAL2"] + 0.003)
    assert x1 < 24 and y2 < 24


def test_grid_wcs_matches_stage3_construction():
    g = _target("barnards-star")["grid"]
    w = grid_wcs(g)
    assert list(w.wcs.crpix) == [25.0, 25.0]
    assert w.wcs.cdelt[0] == pytest.approx(-6.15 / 3600) and w.wcs.cdelt[1] == pytest.approx(6.15 / 3600)
    assert [c.strip() for c in w.wcs.ctype] == ["RA---TAN", "DEC--TAN"]


@pytest.mark.parametrize("patch", PATCHES)
def test_target_radec_matches_target_px(patch):  # exact WCS check against stage3 output
    target = _target(patch)
    g = target["grid"]
    for v in target["visits"]:
        assert radec_to_png(g, *v["target_radec"]) == pytest.approx(
            (v["target_px"]["png_x"], v["target_px"]["png_y"]), abs=0.002)


@pytest.mark.parametrize("patch", PATCHES)
def test_propagated_catalog_matches_target_px(patch):  # linear PM, no parallax: within 0.15 px
    target = _target(patch)
    g, c = target["grid"], target["catalog"]
    for v in target["visits"]:
        ra, dec = propagate(c["ra"], c["dec"], c["pmra"], c["pmdec"], c["ref_epoch_mjd"], v["mjd_mean"])
        got = radec_to_png(g, ra, dec)
        want = (v["target_px"]["png_x"], v["target_px"]["png_y"])
        assert np.hypot(*np.subtract(got, want)) < 0.15


def test_propagate_includes_cosdec():
    ra, dec = propagate(10.0, 60.0, 3.6e6, 0.0, 0.0, 365.25)
    assert ra == pytest.approx(12.0, abs=1e-3) and dec == pytest.approx(60.0)


def test_propagate_dec_and_direction():
    assert MJD_PER_YEAR == 365.25
    ra, dec = propagate(10.0, 0.0, 0.0, 3.6e6, 100.0, 100.0 - 365.25)  # one year back
    assert dec == pytest.approx(-1.0) and ra == pytest.approx(10.0)


def test_propagate_arrays():
    ra, dec = propagate(np.array([10.0, 20.0]), np.array([0.0, 0.0]), np.array([0.0, 0.0]),
                        np.array([3.6e6, -3.6e6]), 0.0, 365.25)
    assert np.allclose(dec, [1.0, -1.0]) and np.allclose(ra, [10.0, 20.0])


def test_sep_arcsec():
    assert sep_arcsec(10.0, 0.0, 10.0, 0.0) == pytest.approx(0.0, abs=1e-9)
    assert sep_arcsec(10.0, 0.0, 10.0, 1.0 / 3600) == pytest.approx(1.0, rel=1e-6)
    # RA offsets shrink by cos(dec)
    assert sep_arcsec(10.0, 60.0, 10.0 + 2.0 / 3600, 60.0) == pytest.approx(1.0, rel=1e-4)
    assert np.allclose(sep_arcsec(0.0, 0.0, np.array([0.0, 0.0]), np.array([1 / 3600, 2 / 3600])), [1.0, 2.0])
