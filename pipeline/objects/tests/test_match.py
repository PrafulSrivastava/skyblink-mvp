import dataclasses
import json
import math
import sys
from pathlib import Path

import numpy as np
import pytest

from catalogs import AllwiseRow, CatwiseRow, TmassRow, load_allwise, load_catwise, load_tmass
from config import CATWISE_EPOCH_MJD, NPIX, PIXEL_SCALE_ARCSEC, THRESHOLDS
from detect import Detection, Frame
from geometry import png_to_radec, propagate, radec_to_png, sep_arcsec
from schema import PixelPos
from match import MatchStats, absorb_target_rows, build_objects, catalog_moving, link_older

FIX = Path(__file__).parent / "fixtures"
sys.path.insert(0, str(FIX))
import make_fixtures  # noqa: E402
TH = dict(THRESHOLDS)

DETS = [
    Detection(24.2, 23.9, 50.0),   # bundle target
    Detection(8.0, 40.1, 40.0),    # comparison star
    Detection(10.1, 9.9, 30.0),    # C1, static CatWISE
    Detection(30.0, 15.0, 25.0),   # C2, fast mover (CatWISE + AllWISE + 2MASS)
    Detection(40.0, 40.0, 20.0),   # A1, AllWISE only
    Detection(20.0, 40.0, 15.0),   # T1, 2MASS only
    Detection(15.0, 30.0, 12.0),   # blend B1/B2
    Detection(35.0, 30.0, 10.0),   # unidentified (C3 is 2 px away)
    Detection(5.0, 25.0, 9.0),     # CQ is flagged D000 -> unidentified
]


@pytest.fixture(scope="module")
def mini():
    return dict(
        target=json.loads((FIX / "mini_target.json").read_text()),
        catwise=load_catwise(FIX / "mini_catwise.csv"),
        allwise=load_allwise(FIX / "mini_allwise.csv"),
        tmass=load_tmass(FIX / "mini_2mass.csv"),
    )


def run(mini, dets=DETS, frames=(), catwise=None, th=TH, target=None):
    return build_objects(
        "mini", target or mini["target"], list(dets), list(frames),
        mini["catwise"] if catwise is None else catwise, mini["allwise"], mini["tmass"], th)


def at(mini, objs, x, y, tol=0.5):
    """The object whose mean-epoch sky position is nearest png (x, y)."""
    g = mini["target"]["grid"]
    best = min(objs, key=lambda o: math.hypot(*np.subtract(radec_to_png(g, o.ra, o.dec), (x, y))))
    d = math.hypot(*np.subtract(radec_to_png(g, best.ra, best.dec), (x, y)))
    assert d < tol, f"no object near ({x}, {y}); nearest is {best.name} at distance {d:.2f}"
    return best


def target_px(mini, vid):
    v = next(v for v in mini["target"]["visits"] if v["id"] == vid)
    return v["target_px"]["png_x"], v["target_px"]["png_y"]


# ---------------------------------------------------------------- fixture ---

def test_fixture_files_are_reproducible(tmp_path):
    make_fixtures.write_all(tmp_path)
    for name in ("mini_target.json", "mini_catwise.csv", "mini_allwise.csv", "mini_2mass.csv"):
        committed = (FIX / name).read_bytes().replace(b"\r\n", b"\n")  # tolerate autocrlf checkouts
        assert (tmp_path / name).read_bytes() == committed, name


def test_fixture_flagged_row_is_filtered_by_loader(mini):
    raw = (FIX / "mini_catwise.csv").read_text()
    assert "CQ" in raw and "D000" in raw
    assert "CQ" not in {r.name for r in mini["catwise"]}


# ------------------------------------------------------------ known/unknown ---

def test_static_catwise_known(mini):
    objs, _ = run(mini)
    o = at(mini, objs, 10.1, 9.9)
    assert o.kind == "known" and o.name.endswith("C1") and o.name.startswith("CWISE ")
    assert o.reason.startswith("CatWISE2020 match within")
    assert o.motion_basis == "catalog" and o.moving is False
    assert o.catalogs[0].catalog == "CatWISE2020" and o.catalogs[0].id == "C1"
    assert o.catalogs[0].mags == {"W1": 12.0, "W2": 11.9}
    assert o.catalogs[0].sep_arcsec == pytest.approx(0.1414 * PIXEL_SCALE_ARCSEC, abs=0.02)
    assert o.detected and o.snr == 30.0 and o.forced is None and o.image_shift_px is None


def test_fast_mover_backpropagation(mini):
    objs, _ = run(mini)
    o = at(mini, objs, 30, 15)
    g = mini["target"]["grid"]
    assert o.kind == "known" and o.moving is True and o.motion_basis == "catalog"
    assert o.pm_mas_yr.total == pytest.approx(2000.0, abs=1e-6)
    assert o.pm_mas_yr.total_err == pytest.approx(math.hypot(35.0, 35.0), abs=1e-6)
    assert [c.catalog for c in o.catalogs] == ["CatWISE2020", "AllWISE", "2MASS"]
    # the raw catalogue positions are far from the detection, so only motion linking finds them
    cw = next(r for r in mini["catwise"] if r.name == "C2")
    assert math.hypot(*np.subtract(radec_to_png(g, cw.ra, cw.dec), (30, 15))) > 3.0
    ra, dec = png_to_radec(g, 30.0, 15.0)
    for name in ("C2_AllWISE", "C2_2MASS"):
        row = next(r for r in mini["allwise"] + mini["tmass"] if r.name == name)
        assert sep_arcsec(ra, dec, row.ra, row.dec) > TH["match_radius_arcsec"]
    # catalogue motion carries the marker between visits (2000 mas/yr north = 0.325 px/yr)
    assert o.positions["v1"].png_x == pytest.approx(30.0, abs=1e-5)
    assert o.positions["v1"].png_y == pytest.approx(15.0 + 0.5476 * 0.32520, abs=2e-3)
    assert o.positions["v2"].png_y == pytest.approx(15.0 - 0.5476 * 0.32520, abs=2e-3)


def test_fast_mover_counted_once(mini):
    objs, _ = run(mini)
    ids = [(c.catalog, c.id) for o in objs for c in o.catalogs]
    assert sum(1 for c, i in ids if i == "C2_AllWISE") == 1
    assert sum(1 for c, i in ids if i == "C2_2MASS") == 1
    mover = at(mini, objs, 30, 15)
    assert {c.id for c in mover.catalogs} >= {"C2", "C2_AllWISE", "C2_2MASS"}
    assert not any(o.name in ("WISEA C2_AllWISE", "2MASS JC2_2MASS") for o in objs)


def test_allwise_only_known(mini):
    objs, _ = run(mini)
    o = at(mini, objs, 40, 40)
    assert o.kind == "known" and o.reason.endswith("(no CatWISE2020 row)")
    assert o.reason.startswith("AllWISE match within")
    assert o.pm_mas_yr is None and o.moving is False and o.motion_basis == "none"
    assert o.name == "WISEA A1" and [c.catalog for c in o.catalogs] == ["AllWISE"]
    assert o.catalog_ra is not None and o.catalog_dec is not None
    assert o.positions["v1"] == o.positions["v2"]


def test_tmass_only_known(mini):
    objs, _ = run(mini)
    o = at(mini, objs, 20, 40)
    assert o.kind == "known" and o.catalogs[0].catalog == "2MASS"
    assert o.reason.startswith("2MASS match within") and o.reason.endswith("(no CatWISE2020 or AllWISE row)")
    assert o.name == "2MASS JT1" and o.pm_mas_yr is None and o.moving is False
    assert o.catalogs[0].mags == {"J": 14.0, "H": 13.5, "K": 13.0}


def test_blend_picks_brightest(mini):
    objs, _ = run(mini)
    o = at(mini, objs, 15, 30)
    assert o.catalogs[0].id == "B2"      # W1 11.0 beats the nearer W1 15.0 row
    assert not any(c.id == "B1" for ob in objs for c in ob.catalogs)


def test_unidentified_reason(mini):
    objs, _ = run(mini)
    o = at(mini, objs, 35, 30)
    assert o.kind == "unidentified" and o.moving is False and o.motion_basis == "none"
    assert o.reason == "no CatWISE/AllWISE/2MASS source within 9.2 arcsec"
    assert o.name == "Unidentified #001"
    assert o.catalogs == [] and o.pm_mas_yr is None and o.catalog_ra is None and o.forced is None
    assert o.image_shift_px is None      # no frames given
    assert not any(c.id == "C3" for ob in objs for c in ob.catalogs)  # 2 px away: outside 1.5 px


def test_unidentified_numbering_follows_output_order(mini):
    objs, _ = run(mini)
    names = [o.name for o in objs if o.kind == "unidentified"]
    assert names == ["Unidentified #001", "Unidentified #002"]
    assert at(mini, objs, 35, 30).name == "Unidentified #001"
    assert at(mini, objs, 5, 25).name == "Unidentified #002"


def test_flagged_catwise_row_ignored(mini):
    objs, _ = run(mini)
    o = at(mini, objs, 5, 25)
    assert o.kind == "unidentified" and o.catalogs == []


def test_target_split_rows_absorbed(mini):
    objs, stats = run(mini)
    assert stats.n_absorbed == 2
    assert not any(c.id in ("S1", "S2") for o in objs for c in o.catalogs)
    assert not any(n in o.name for o in objs for n in ("S1", "S2"))


def test_absorption_protects_neighbour_match(mini):
    # Counterfactual: S1's junk motion puts it on top of C2's detection with a brighter W1.
    th = {**TH, "target_absorb_radius_arcsec": 0.0}
    objs, stats = run(mini, th=th)
    assert stats.n_absorbed == 0
    assert at(mini, objs, 30, 15).catalogs[0].id == "S1"
    objs, _ = run(mini)
    assert at(mini, objs, 30, 15).catalogs[0].id == "C2"


def test_absorb_target_rows_unit(mini):
    kept, absorbed = absorb_target_rows(mini["catwise"], mini["target"], 20.0, 1000.0)
    assert {r.name for r in absorbed} == {"S1", "S2"}
    assert {r.name for r in kept} == {"C1", "C2", "C3", "B1", "B2"}
    kept, absorbed = absorb_target_rows(mini["catwise"], mini["target"], 10.0, 1000.0)
    assert {r.name for r in absorbed} == {"S1"}
    assert len(kept) + len(absorbed) == len(mini["catwise"])
    kept, absorbed = absorb_target_rows([], mini["target"], 20.0, 1000.0)
    assert kept == [] and absorbed == []


# --------------------------------------------------------------- forced ---

def test_forced_target_claims_detection(mini):
    objs, stats = run(mini)
    o = at(mini, objs, 24.2, 23.9)
    assert o.forced == "bundle target" and o.reason == "bundle target" and o.kind == "known"
    assert o.moving is True and o.motion_basis == "catalog"
    assert o.name == "Mini Target" and o.detected and o.snr == 50.0
    assert o.pm_mas_yr.pmra == 3000.0 and o.pm_mas_yr.pmdec == 0.0
    assert o.pm_mas_yr.total == pytest.approx(3000.0) and o.pm_mas_yr.total_err == pytest.approx(math.hypot(0.5, 0.5))
    assert o.catalogs[0].catalog == "Gaia DR3" and o.catalogs[0].id == "1000000000000000001"
    assert o.catalogs[0].mags == {"G": 9.5} and o.catalogs[0].sep_arcsec is None
    p1, p2 = target_px(mini, "v1"), target_px(mini, "v2")
    assert (o.positions["v1"].png_x, o.positions["v1"].png_y) == pytest.approx((p1[0] + 0.2, p1[1] - 0.1), abs=1e-6)
    assert (o.positions["v2"].png_x, o.positions["v2"].png_y) == pytest.approx((p2[0] + 0.2, p2[1] - 0.1), abs=1e-6)
    ra, dec = png_to_radec(mini["target"]["grid"], 24.2, 23.9)
    assert (o.ra, o.dec) == pytest.approx((ra, dec), abs=1e-9)
    me = mini["target"]["mean_epoch"]
    assert (o.catalog_ra, o.catalog_dec) == (me["ra_deg"], me["dec_deg"])
    assert stats.target_detected is True


def test_forced_target_without_detection(mini):
    dets = [d for d in DETS if d.snr != 50.0]
    objs, stats = run(mini, dets=dets)
    o = objs[-1]  # placed after every detected object
    assert o.forced == "bundle target" and o.detected is False and o.snr is None
    assert all(x.detected for x in objs[:-1])
    for vid in ("v1", "v2"):
        assert (o.positions[vid].png_x, o.positions[vid].png_y) == pytest.approx(target_px(mini, vid), abs=1e-9)
    me = mini["target"]["mean_epoch"]
    assert (o.ra, o.dec) == (me["ra_deg"], me["dec_deg"])
    assert o.moving is True and o.kind == "known"
    assert stats.target_detected is False
    assert len(objs) == len(dets) + 1  # the comparison star still claims its detection


def test_forced_target_does_not_claim_far_detection(mini):
    far = [Detection(27.0, 24.0, 50.0)] + [d for d in DETS if d.snr != 50.0]  # 3 px away > 2 px
    objs, _ = run(mini, dets=far)
    assert objs[-1].forced == "bundle target" and objs[-1].detected is False
    assert at(mini, objs, 27, 24).kind == "unidentified"


def test_comparison_star(mini):
    objs, stats = run(mini)
    o = at(mini, objs, 8.0, 40.1)
    assert o.forced == "comparison star" and o.reason == "comparison star" and o.kind == "known"
    assert o.name == "Gaia DR3 1000000000000000002" and o.moving is False
    assert o.motion_basis == "catalog"
    assert o.pm_mas_yr.pmra is None and o.pm_mas_yr.pmdec is None
    assert o.pm_mas_yr.total == 2.0 and o.pm_mas_yr.total_err is None
    assert [c.catalog for c in o.catalogs] == ["Gaia DR3"] and o.catalogs[0].mags == {"G": 12.0}
    # constant position, with the detection-to-catalogue offset applied
    assert (o.positions["v1"].png_x, o.positions["v1"].png_y) == pytest.approx((8.0, 40.1), abs=1e-9)
    assert o.positions["v1"] == o.positions["v2"]
    assert stats.comparison_offset_px == pytest.approx(0.1, abs=1e-9)


def test_comparison_star_links_catwise_row(mini):
    g = mini["target"]["grid"]
    ra, dec = png_to_radec(g, 8.3, 40.1)  # 0.3 px from the detection, static
    row = CatwiseRow("CMP", ra, dec, 0.0, 0.0, 10.0, 12.5, 12.4, "0000", "00")
    objs, _ = run(mini, catwise=mini["catwise"] + [row])
    o = at(mini, objs, 8.0, 40.1)
    assert o.forced == "comparison star"
    assert [c.catalog for c in o.catalogs] == ["Gaia DR3", "CatWISE2020"]
    assert o.catalogs[1].id == "CMP" and o.catalogs[1].mags == {"W1": 12.5, "W2": 12.4}
    assert o.catalogs[1].sep_arcsec == pytest.approx(0.3 * PIXEL_SCALE_ARCSEC, abs=0.05)
    assert sum(1 for ob in objs for c in ob.catalogs if c.id == "CMP") == 1
    # a CatWISE row outside the match radius is not attached
    ra, dec = png_to_radec(g, 9.9, 40.1)
    far = CatwiseRow("FAR", ra, dec, 0.0, 0.0, 10.0, 12.5, 12.4, "0000", "00")
    objs, _ = run(mini, catwise=mini["catwise"] + [far])
    assert [c.catalog for c in at(mini, objs, 8.0, 40.1).catalogs] == ["Gaia DR3"]


def test_forced_detections_are_not_reclaimed_by_catwise(mini):
    # a bright CatWISE row on the comparison star's detection: no extra object appears, the star may link its own
    g = mini["target"]["grid"]
    row = CatwiseRow("ONCOMP", *png_to_radec(g, 8.0, 40.1), 0.0, 0.0, 10.0, 9.0, 9.0, "0000", "00")
    objs, _ = run(mini, catwise=mini["catwise"] + [row])
    assert len(objs) == len(DETS)
    assert [c.catalog for c in at(mini, objs, 8.0, 40.1).catalogs] == ["Gaia DR3", "CatWISE2020"]


def test_no_comparison_star(mini):
    target = {**mini["target"], "comparison_star": None}
    objs, stats = run(mini, target=target)
    assert not any(o.forced == "comparison star" for o in objs)
    assert stats.comparison_offset_px is None
    assert at(mini, objs, 8.0, 40.1).kind == "unidentified"


def test_wise_style_target_with_catwise_catalog(mini):
    c = mini["target"]["catalog"]
    cat = {"catalog": "CatWISE2020", "source_id": "J100000.00+020000.0", "ra": c["ra"], "dec": c["dec"],
           "pmra": 3000.0, "pmdec": 0.0, "pmra_err": 90.0, "pmdec_err": 140.0, "W1": 18.3, "W2": 14.1,
           "ref_epoch_mjd": c["ref_epoch_mjd"]}
    objs, _ = run(mini, target={**mini["target"], "catalog": cat})
    o = at(mini, objs, 24.2, 23.9)
    assert o.catalogs[0].catalog == "CatWISE2020" and o.catalogs[0].mags == {"W1": 18.3, "W2": 14.1}
    assert o.pm_mas_yr.total_err == pytest.approx(math.hypot(90.0, 140.0))
    assert o.moving is True


# ------------------------------------------------------- structure/order ---

def test_positions_cover_all_visits(mini):
    objs, _ = run(mini)
    assert len(objs) == len(DETS)
    for o in objs:
        assert set(o.positions) == {"v1", "v2"}
    objs, _ = run(mini, dets=[])
    assert len(objs) == 2 and all(set(o.positions) == {"v1", "v2"} for o in objs)


def test_ids_and_order(mini):
    objs, _ = run(mini)
    assert [o.id for o in objs] == [f"mini-{i:03d}" for i in range(1, len(objs) + 1)]
    snrs = [o.snr for o in objs]
    assert snrs == sorted(snrs, reverse=True) == [50.0, 40.0, 30.0, 25.0, 20.0, 15.0, 12.0, 10.0, 9.0]
    objs, _ = run(mini, dets=[d for d in DETS if d.snr not in (50.0, 40.0)])
    assert [o.forced for o in objs[-2:]] == ["bundle target", "comparison star"]
    assert [o.detected for o in objs] == [True] * (len(objs) - 2) + [False, False]
    assert objs[-1].id == f"mini-{len(objs):03d}"


def test_each_detection_and_row_used_once(mini):
    objs, _ = run(mini)
    ids = [(c.catalog, c.id) for o in objs for c in o.catalogs]
    assert len(ids) == len(set(ids))
    assert len({(o.positions["v1"].png_x, o.positions["v1"].png_y) for o in objs}) == len(objs)


# ---------------------------------------------------------- catalog_moving ---

def test_catalog_moving_rules():
    assert catalog_moving(1000.0, None, TH) and not catalog_moving(999.9, None, TH)
    assert not catalog_moving(1500.0, 400.0, TH)   # < 5 sigma
    assert catalog_moving(2000.0, 399.0, TH)
    assert catalog_moving(2000.0, 400.0, TH)       # exactly 5 sigma counts


def test_catalog_moving_unknown_sigma_is_not_infinite_significance():
    # load_catwise turns a missing sigpm into 0.0: that means unknown, so skip the significance test
    assert catalog_moving(1500.0, 0.0, TH)
    assert not catalog_moving(500.0, 0.0, TH)
    assert catalog_moving(1500.0, -1.0, TH)


def _with_pm(row, pmdec, sigpm, mjd0=61000.0):
    """Same mean-epoch position, different proper motion (so the row still sits on its detection)."""
    ra, dec = propagate(row.ra, row.dec, 0.0, pmdec, mjd0, CATWISE_EPOCH_MJD)
    return dataclasses.replace(row, ra=ra, dec=dec, pmdec=pmdec, sigpm=sigpm)


def test_unknown_catwise_sigpm_flows_through_build(mini):
    cw = [_with_pm(r, 1500.0, 0.0) if r.name == "C1" else r for r in mini["catwise"]]
    objs, _ = run(mini, catwise=cw)
    o = at(mini, objs, 10.1, 9.9)
    assert o.catalogs[0].id == "C1" and o.moving is True   # sigpm 0.0 = unknown, not infinite significance
    assert o.pm_mas_yr.total_err is None
    cw = [_with_pm(r, 1500.0, 400.0) if r.name == "C1" else r for r in mini["catwise"]]
    objs, _ = run(mini, catwise=cw)
    o = at(mini, objs, 10.1, 9.9)
    assert o.catalogs[0].id == "C1" and o.moving is False and o.pm_mas_yr.total_err == 400.0


# --------------------------------------------------------------- link_older ---

def _cw(**kw):
    base = dict(name="X", ra=150.0, dec=2.0, pmra=0.0, pmdec=2000.0, sigpm=0.0, w1=12.0, w2=12.0,
                cc_flags="0000", ab_flags="00")
    return CatwiseRow(**{**base, **kw})


def _aw(name, ra, dec, epoch=55400.0):
    return AllwiseRow(name, ra, dec, epoch, 12.0, 12.0, None)


def test_link_older_propagates_and_respects_radius_and_used():
    cw = _cw()
    ra, dec = propagate(cw.ra, cw.dec, cw.pmra, cw.pmdec, CATWISE_EPOCH_MJD, 55400.0)
    exact = _aw("exact", ra, dec)
    off2 = _aw("off2", ra, dec + 2.0 / 3600)
    off4 = _aw("off4", ra, dec + 4.0 / 3600)
    unmoved = _aw("unmoved", cw.ra, cw.dec)
    idx, sep = link_older(cw, [unmoved, off4, off2, exact], TH, set())
    assert idx == 3 and sep == pytest.approx(0.0, abs=1e-3)
    idx, sep = link_older(cw, [unmoved, off4, off2, exact], TH, {3})
    assert idx == 2 and sep == pytest.approx(2.0, abs=1e-3)
    idx, sep = link_older(cw, [unmoved, off4], TH, set())  # 4 arcsec > 3 arcsec base radius, sigpm unknown
    assert (idx, sep) == (None, None)
    idx, sep = link_older(_cw(sigpm=200.0), [off4], TH, set())  # 3 + 3*200*4.85/1000 = 5.9 arcsec
    assert idx == 0 and sep == pytest.approx(4.0, abs=1e-3)
    assert link_older(cw, [], TH, set()) == (None, None)


def test_link_older_radius_is_capped():
    cw = _cw(sigpm=5000.0)  # uncapped radius would be huge; cap is 6 arcsec
    ra, dec = propagate(cw.ra, cw.dec, cw.pmra, cw.pmdec, CATWISE_EPOCH_MJD, 55400.0)
    assert link_older(cw, [_aw("a", ra, dec + 5.5 / 3600)], TH, set())[0] == 0
    assert link_older(cw, [_aw("b", ra, dec + 6.5 / 3600)], TH, set())[0] is None


# ------------------------------------------------------------ empty CatWISE ---

def test_build_objects_with_empty_catwise(mini):
    objs, stats = run(mini, catwise=[])
    target = next(o for o in objs if o.forced == "bundle target")
    assert target.detected and target.kind == "known"
    # AllWISE and 2MASS direct matches still work
    assert at(mini, objs, 40, 40).name == "WISEA A1"
    assert at(mini, objs, 20, 40).name == "2MASS JT1"
    # rows that depended on CatWISE are now unidentified
    assert at(mini, objs, 10.1, 9.9).kind == "unidentified"
    assert stats.n_catwise_in_grid == 0 and stats.median_sep_px is None
    assert stats.bright_recovery is None and stats.chance_per_circle == 0.0 and stats.n_absorbed == 0


def test_build_objects_with_no_detections(mini):
    objs, stats = run(mini, dets=[], catwise=[])
    assert [o.forced for o in objs] == ["bundle target", "comparison star"]
    assert stats.target_detected is False and stats.comparison_offset_px is None


# -------------------------------------------------------------------- stats ---

def test_match_stats(mini):
    _, stats = run(mini)
    assert isinstance(stats, MatchStats)
    assert stats.median_sep_px == pytest.approx(math.hypot(0.1, 0.1), abs=1e-4)  # C1 .141, C2 0, B2 .806
    assert stats.n_catwise_in_grid == 5
    assert stats.chance_per_circle == pytest.approx(5 / 49 ** 2 * math.pi * 1.5 ** 2)
    assert stats.bright_recovery == 1.0   # C1 (W1 12) and B2 (W1 11) are the bright in-grid rows
    assert stats.n_absorbed == 2
    assert stats.shift_floor_px == 0.5    # no frames: fewer than 3 measurements
    assert stats.comparison_offset_px == pytest.approx(0.1, abs=1e-9)
    assert stats.target_detected is True


def test_bright_recovery_counts_missed_bright_rows(mini):
    _, stats = run(mini, dets=[d for d in DETS if d.snr != 30.0])  # drop the C1 detection
    assert stats.bright_recovery == 0.5


# ------------------------------------------------------------- image motion ---

YY, XX = np.mgrid[0:NPIX, 0:NPIX]


def _frames(per_visit, n=12, seed=3, amp=5.0):
    rng = np.random.default_rng(seed)
    out = []
    for visit, sources in per_visit.items():
        clean = sum((amp * np.exp(-((XX - x) ** 2 + (YY - y) ** 2) / (2 * 0.6 ** 2)) for x, y in sources),
                    np.zeros((NPIX, NPIX)))
        for _ in range(n):
            out.append(Frame("D1", visit, (clean + rng.normal(0.0, 1.0, (NPIX, NPIX))).astype(np.float32)))
    return out


STATICS = [(10.1, 9.9), (15.0, 30.0), (37.0, 30.0)]          # C1, B2 and C3 in the fixture
STATIC_DETS = [Detection(10.1, 9.9, 30.0), Detection(15.0, 30.0, 12.0), Detection(37.0, 30.0, 10.0)]


def _image_run(mini, shift, with_statics=True):
    a, b = (20.0 - shift / 2, 20.0), (20.0 + shift / 2, 20.0)
    frames = _frames({"v1": STATICS * with_statics + [a], "v2": STATICS * with_statics + [b]})
    dets = (STATIC_DETS if with_statics else []) + [Detection(20.0, 20.0, 15.0)]
    objs, stats = run(mini, dets=dets, frames=frames)
    return at(mini, objs, 20.0, 20.0), objs, stats


def test_image_motion_flag(mini):
    o, objs, stats = _image_run(mini, 1.6)
    assert o.kind == "unidentified" and o.moving is True and o.motion_basis == "image"
    assert o.image_shift_px == pytest.approx(1.6, abs=0.3)
    assert o.positions["v1"].png_x < o.positions["v2"].png_x
    assert o.positions["v1"].png_x == pytest.approx(19.2, abs=0.3)
    assert o.positions["v2"].png_x == pytest.approx(20.8, abs=0.3)
    # the static CatWISE-matched sources set a low floor and stay non-moving
    assert stats.shift_floor_px < 0.3
    for x, y in STATICS:
        s = at(mini, objs, x, y)
        assert s.kind == "known" and s.moving is False and s.motion_basis == "catalog"

    o, _, _ = _image_run(mini, 0.4)
    assert o.moving is False and o.motion_basis == "none"
    assert o.image_shift_px == pytest.approx(0.4, abs=0.3)  # measured, but below threshold
    assert o.positions["v1"] == o.positions["v2"]


def test_image_motion_floor_defaults_without_enough_statics(mini):
    o, _, stats = _image_run(mini, 1.2, with_statics=False)
    assert stats.shift_floor_px == 0.5       # fewer than 3 static matches
    assert o.image_shift_px == pytest.approx(1.2, abs=0.3)
    assert o.moving is False                 # needs >= 3 * 0.5 = 1.5 px
    o, _, stats = _image_run(mini, 2.4, with_statics=False)
    assert o.moving is True and o.motion_basis == "image"


def test_image_motion_needs_snr_in_both_visits(mini):
    # source present in v1 only: the v2 centroid has no signal, so no motion claim is made
    frames = _frames({"v1": [(20.0, 20.0)], "v2": []})
    objs, _ = run(mini, dets=[Detection(20.0, 20.0, 15.0)], frames=frames)
    o = at(mini, objs, 20.0, 20.0)
    assert o.moving is False and o.motion_basis == "none"
    assert o.image_shift_px is None  # not measurable, so no (noise) number is reported


def test_no_frames_means_no_image_shift(mini):
    objs, stats = run(mini, frames=[])
    assert all(o.image_shift_px is None for o in objs)
    assert stats.shift_floor_px == 0.5


def _track_rows(t):
    """Rows 25 arcsec east / west of the target's CatWISE-epoch position (both on its 2010-2018 track)."""
    c = t["catalog"]
    epoch_ra, epoch_dec = propagate(c["ra"], c["dec"], c["pmra"], c["pmdec"], c["ref_epoch_mjd"], CATWISE_EPOCH_MJD)
    arc = 1 / 3600 / math.cos(math.radians(epoch_dec))
    return epoch_ra, epoch_dec, arc


def test_absorb_follows_the_target_track_only_for_high_pm_rows(mini):
    """CatWISE splits a fast mover into rows along its whole 2010-2018 track, and the junk fragments carry large
    motions. A row near the track (but not at the CatWISE-epoch point) is absorbed only with pm >= 1000 mas/yr."""
    t = mini["target"]
    epoch_ra, epoch_dec, arc = _track_rows(t)

    def row(name, ra, dec, pm=(0.0, 0.0)):
        return CatwiseRow(name, ra, dec, pm[0], pm[1], 10.0, 12.0, 12.0, "", "00")

    # the target moves east at 3 arcsec/yr: its track runs from -16 arcsec (2010) to +11 arcsec (2018) of the
    # CatWISE-epoch position, so a row 25 arcsec east is 14 arcsec from the track end, and one 25 arcsec
    # west is 9 arcsec from the 2010 end.
    east_fast = row("E", epoch_ra + 25 * arc, epoch_dec, (0.0, 1500.0))
    west_fast = row("W", epoch_ra - 25 * arc, epoch_dec, (-1200.0, 0.0))
    east_static = row("ES", epoch_ra + 25 * arc, epoch_dec + 1 / 3600, (3.0, 4.0))
    west_slow = row("WS", epoch_ra - 25 * arc, epoch_dec + 1 / 3600, (400.0, 300.0))
    off_track_fast = row("N", epoch_ra, epoch_dec + 25 / 3600, (0.0, 5000.0))
    far_fast = row("F", epoch_ra + 40 * arc, epoch_dec, (0.0, 5000.0))
    at_epoch_static = row("P", epoch_ra + 5 * arc, epoch_dec)  # at the epoch point: absorbed whatever its pm
    rows = [east_fast, west_fast, east_static, west_slow, off_track_fast, far_fast, at_epoch_static]
    kept, absorbed = absorb_target_rows(rows, t, 20.0, 1000.0)
    assert {r.name for r in absorbed} == {"E", "W", "P"}
    assert {r.name for r in kept} == {"ES", "WS", "N", "F"}
    # only the epoch point (not the track) reaches the fast rows' positions or the static rows' positions
    assert min(sep_arcsec(epoch_ra, epoch_dec, r.ra, r.dec) for r in rows if r.name != "P") > 20.0
    # the pm cut is the given threshold
    kept, absorbed = absorb_target_rows(rows, t, 20.0, 200.0)
    assert {r.name for r in absorbed} == {"E", "W", "P", "WS"}


def test_absorb_epoch_point_rows_are_always_absorbed(mini):
    t = mini["target"]
    epoch_ra, epoch_dec, arc = _track_rows(t)
    row = CatwiseRow("P", epoch_ra, epoch_dec + 18 / 3600, 0.0, 0.0, 10.0, 12.0, 12.0, "", "00")
    kept, absorbed = absorb_target_rows([row], t, 20.0, 1000.0)
    assert [r.name for r in absorbed] == ["P"] and kept == []


# ------------------------------------------------- PM consistency (older rows) ---

def _fast_row(name="J1", pos=(12.0, 20.0), pm=(1500.0, 0.0)):
    """A CatWISE row that is at png `pos` at the mean epoch and moves `pm` mas/yr (loader units)."""
    r = make_fixtures._catwise_row(name, *make_fixtures._sky(*pos), pm=pm, sig=0.01, w1=13.0)
    return CatwiseRow(name, r["ra_pm"], r["dec_pm"], pm[0], pm[1], 14.1, 13.0, 12.9, "", "00")


def _with_rows(mini, catwise_row, tmass=(), allwise=()):
    m = {**mini, "tmass": mini["tmass"] + list(tmass), "allwise": mini["allwise"] + list(allwise)}
    return m, mini["catwise"] + [catwise_row]


def _tmass_at_static(pos=(12.0, 20.0), mjd=51400.0, name="J1T"):
    r = make_fixtures._tmass_row(name, *make_fixtures._sky(*pos), mjd)
    return load_tmass_row(r)


def load_tmass_row(r):
    from catalogs import TmassRow
    return TmassRow(r["designation"], r["ra"], r["dec"], r["jdate"] - 2400000.5, r["j_m"], r["h_m"], r["k_m"])


def test_pm_contradicted_catwise_row_is_released_to_the_older_row(mini):
    # the row is ~15.7 arcsec from the detection at its own epoch: it matched only through the rejected motion
    m, cw = _with_rows(mini, _fast_row(), tmass=[_tmass_at_static()])
    objs, _ = run(m, dets=[Detection(12.0, 20.0, 20.0)], catwise=cw)
    o = at(m, objs, 12, 20)
    assert o.kind == "known" and o.name == "2MASS JJ1T"
    assert o.reason.startswith("2MASS match within") and o.reason.endswith("(no CatWISE2020 or AllWISE row)")
    assert [(c.catalog, c.id) for c in o.catalogs] == [("2MASS", "J1T")]
    assert o.moving is False and o.motion_basis == "none" and o.pm_mas_yr is None
    assert o.positions["v1"] == o.positions["v2"]
    assert (o.positions["v1"].png_x, o.positions["v1"].png_y) == (12.0, 20.0)
    assert (o.catalog_ra, o.catalog_dec) == (m["tmass"][-1].ra, m["tmass"][-1].dec)
    assert not any(c.id == "J1" for ob in objs for c in ob.catalogs)  # the CatWISE row is not shown anywhere
    assert not any(ob.name.endswith(" J1") for ob in objs)


def test_pm_contradicted_but_statically_matching_catwise_row_is_kept(mini):
    # pm 1000 mas/yr moves the row 10.5 arcsec in 10.5 years; the detection is still 4.3 arcsec from its listed position
    row = _fast_row(pm=(1000.0, 0.0))
    ra, dec = make_fixtures._sky(13.0, 20.0)
    t = TmassRow("J1T", ra, dec, 51400.0, 14.0, 13.5, 13.0)
    m, cw = _with_rows(mini, row, tmass=[t])
    det = Detection(13.0, 20.0, 20.0)
    assert sep_arcsec(*png_to_radec(m["target"]["grid"], 13.0, 20.0), row.ra, row.dec) < TH["match_radius_arcsec"]
    objs, _ = run(m, dets=[det], catwise=cw)
    o = at(m, objs, 13, 20)
    assert o.name == "CWISE J1" and o.catalogs[0].catalog == "CatWISE2020" and o.reason.startswith("CatWISE2020 match")
    assert [c.catalog for c in o.catalogs] == ["CatWISE2020", "2MASS"] and o.catalogs[1].id == "J1T"
    assert o.moving is False and o.motion_basis == "none" and o.pm_mas_yr is None
    assert o.positions["v1"] == o.positions["v2"] == PixelPos(13.0, 20.0)


def test_released_catwise_row_returns_to_the_pool(mini):
    row = _fast_row(pm=(1000.0, 0.0))
    ra, dec = make_fixtures._sky(10.6, 20.0)
    t = TmassRow("J1T", ra, dec, 51400.0, 14.0, 13.5, 13.0)
    m, cw = _with_rows(mini, row, tmass=[t])
    # A (brighter detection) is 1.7 px from the row's listed position: contradicted, released to the 2MASS row.
    # B is 1.4 px from where the row's motion puts it and 2.8 px from the 2MASS row: it takes the CatWISE row.
    objs, _ = run(m, dets=[Detection(12.0, 20.0, 20.0), Detection(13.4, 20.0, 15.0)], catwise=cw)
    a, b = at(m, objs, 12.0, 20.0), at(m, objs, 13.4, 20.0)
    assert a.name == "2MASS JJ1T" and a.moving is False and a.pm_mas_yr is None
    assert b.name == "CWISE J1" and b.moving is True and b.motion_basis == "catalog" and b.pm_mas_yr is not None
    assert [c.catalog for c in b.catalogs] == ["CatWISE2020"]


def test_fast_mover_with_linked_older_rows_stays_moving(mini):
    objs, _ = run(mini)
    o = at(mini, objs, 30, 15)
    assert o.moving is True and o.motion_basis == "catalog" and o.pm_mas_yr is not None
    assert [c.catalog for c in o.catalogs] == ["CatWISE2020", "AllWISE", "2MASS"]
    assert o.positions["v1"] != o.positions["v2"]


def test_high_pm_row_without_older_rows_stays_moving(mini):
    m, cw = _with_rows(mini, _fast_row())
    objs, _ = run(m, dets=[Detection(12.0, 20.0, 20.0)], catwise=cw)
    o = at(m, objs, 12, 20)
    assert o.moving is True and o.motion_basis == "catalog" and o.pm_mas_yr.total == pytest.approx(1500.0)
    assert o.positions["v1"] != o.positions["v2"]


def test_allwise_row_under_five_years_does_not_contradict(mini):
    from catalogs import AllwiseRow
    ra, dec = make_fixtures._sky(12.0, 20.0)
    aw = AllwiseRow("J1A", ra, dec, 55400.0, 13.0, 12.9, 12.0)  # 4.85 years before the CatWISE epoch
    m, cw = _with_rows(mini, _fast_row(), allwise=[aw])
    objs, _ = run(m, dets=[Detection(12.0, 20.0, 20.0)], catwise=cw)
    assert at(m, objs, 12, 20).moving is True


def test_older_row_that_follows_the_motion_does_not_contradict(mini):
    row = _fast_row()
    ra, dec = propagate(row.ra, row.dec, row.pmra, row.pmdec, CATWISE_EPOCH_MJD, 51400.0)
    from catalogs import TmassRow
    t = TmassRow("J1T", ra, dec, 51400.0, 14.0, 13.5, 13.0)
    m, cw = _with_rows(mini, row, tmass=[t])
    objs, _ = run(m, dets=[Detection(12.0, 20.0, 20.0)], catwise=cw)
    o = at(m, objs, 12, 20)
    assert o.moving is True and [c.catalog for c in o.catalogs] == ["CatWISE2020", "2MASS"]


def test_static_catwise_row_never_loses_its_pm(mini):
    # a 2MASS row 7 arcsec away from a static CatWISE row is just a neighbour: motion is not "contradicted"
    row = _fast_row(pm=(5.0, 5.0))
    ra, dec = make_fixtures._sky(12.0, 20.0)
    from catalogs import TmassRow
    t = TmassRow("J1T", ra, dec + 7.0 / 3600, 51400.0, 14.0, 13.5, 13.0)
    m, cw = _with_rows(mini, row, tmass=[t])
    objs, _ = run(m, dets=[Detection(12.0, 20.0, 20.0)], catwise=cw)
    assert at(m, objs, 12, 20).pm_mas_yr is not None


def test_linked_fast_mover_ignores_unrelated_field_star_at_static_position(mini):
    """A linked older row corroborates the CatWISE motion; a field star at the static position must not undo it."""
    field = _tmass_at_static(pos=(30.0, 15.0), mjd=51400.0, name="FIELD")
    m = {**mini, "tmass": mini["tmass"] + [field]}
    ra, dec = png_to_radec(m["target"]["grid"], 30.0, 15.0)
    assert sep_arcsec(ra, dec, field.ra, field.dec) < TH["match_radius_arcsec"]  # the trap is really set
    objs, _ = run(m)
    o = at(m, objs, 30, 15)
    assert o.moving is True and o.motion_basis == "catalog"
    assert o.pm_mas_yr.total == pytest.approx(2000.0, abs=1e-6)
    assert o.positions["v1"] != o.positions["v2"]
    assert [c.catalog for c in o.catalogs] == ["CatWISE2020", "AllWISE", "2MASS"]
    assert next(c for c in o.catalogs if c.catalog == "2MASS").id == "C2_2MASS"
    assert not any(c.id == "FIELD" for o2 in objs for c in o2.catalogs)  # not attached to C2 or anything else


def test_contradiction_ignores_rows_used_by_another_object(mini):
    """A 2MASS row already claimed by another object never counts as contradicting evidence."""
    row = _fast_row()
    t = _tmass_at_static()
    m, cw = _with_rows(mini, row, tmass=[t])
    objs, _ = run(m, dets=[Detection(12.0, 20.0, 20.0)], catwise=cw)
    assert at(m, objs, 12, 20).moving is False  # baseline: unclaimed row contradicts
    from match import contradicting_older
    ra, dec = make_fixtures._sky(12.0, 20.0)
    assert contradicting_older(row, ra, dec, [], [t], TH, set(), {0}) == []
    assert [x[:2] for x in contradicting_older(row, ra, dec, [], [t], TH, set(), set())] == [("2MASS", 0)]


# ------------------------------------------- target vs catalogued static stars ---

def _star_run(mini, kind, star_xy=(25.1, 23.98), det_xy=(25.1, 23.98), **kw):
    """Run with a catalogued static star's detection ~1.1 px from the target at (24, 24)."""
    g = mini["target"]["grid"]
    ra, dec = png_to_radec(g, *star_xy)
    m, cw = dict(mini), mini["catwise"]
    if kind == "catwise":
        cw = cw + [CatwiseRow("STAR", ra, dec, 12.0, 0.0, 10.0, 15.0, 15.0, "0000", "00")]
    elif kind == "allwise":
        m["allwise"] = m["allwise"] + [AllwiseRow("STAR", ra, dec, 55400.0, 15.0, 15.0, None)]
    else:
        m["tmass"] = m["tmass"] + [TmassRow("STAR", ra, dec, 51400.0, 15.0, 14.5, 14.0)]
    dets = [Detection(*det_xy, 50.0)] + [d for d in DETS if d.snr != 50.0]
    objs, stats = run(m, dets=dets, catwise=cw, **kw)
    return m, objs, stats


@pytest.mark.parametrize("kind,prefix", [("catwise", "CWISE "), ("allwise", "WISEA "), ("2mass", "2MASS J")])
def test_target_does_not_claim_a_detection_a_catalogued_star_explains(mini, kind, prefix):
    m, objs, stats = _star_run(mini, kind)
    t = next(o for o in objs if o.forced == "bundle target")
    assert t.detected is False and t.snr is None and stats.target_detected is False
    me = mini["target"]["mean_epoch"]
    assert (t.ra, t.dec) == (me["ra_deg"], me["dec_deg"])
    for vid in ("v1", "v2"):
        assert (t.positions[vid].png_x, t.positions[vid].png_y) == pytest.approx(target_px(mini, vid), abs=1e-9)
    star = at(m, [o for o in objs if o is not t], 25.1, 23.98, tol=0.05)
    assert star.kind == "known" and star.forced is None and star.detected and star.snr == 50.0
    assert star.name == prefix + "STAR" and star.catalogs[0].id == "STAR"
    assert len(objs) == len(DETS) + 1  # every detection is an object, plus the undetected target


def test_target_claims_the_detection_when_the_star_is_farther_than_the_target(mini):
    # detection 1.1 px from the target; the catalogued star is 1.4 px from the detection: not a better explanation
    m, objs, stats = _star_run(mini, "catwise", star_xy=(26.5, 23.98), det_xy=(25.1, 23.98))
    t = next(o for o in objs if o.forced == "bundle target")
    assert t.detected and t.snr == 50.0 and stats.target_detected is True
    assert len(objs) == len(DETS)


def test_target_own_older_rows_are_attached_and_not_reused(mini):
    """The target's own AllWISE / 2MASS rows (2 arcsec off the back-propagated position) belong to the target."""
    c = mini["target"]["catalog"]
    own = {}
    for label, mjd in (("AllWISE", 55400.0), ("2MASS", 51400.0)):
        ra, dec = propagate(c["ra"], c["dec"], c["pmra"], c["pmdec"], c["ref_epoch_mjd"], mjd)
        own[label] = (ra, dec + 2.0 / 3600)
    aw = AllwiseRow("TGT_AW", *own["AllWISE"], 55400.0, 12.0, 11.5, 9.0)
    tm = TmassRow("TGT_TM", *own["2MASS"], 51400.0, 11.0, 10.5, 10.0)
    m = {**mini, "allwise": mini["allwise"] + [aw], "tmass": mini["tmass"] + [tm]}
    g = mini["target"]["grid"]
    xa, ya = radec_to_png(g, aw.ra, aw.dec)
    xt, yt = radec_to_png(g, tm.ra, tm.dec)
    assert 3 < xa < 45 and 3 < xt < 45 and abs(xa - xt) > 3  # both fall inside the patch, apart from each other
    dets = DETS + [Detection(float(xa), float(ya), 14.0), Detection(float(xt), float(yt), 13.0)]
    objs, _ = run(m, dets=dets)
    t = next(o for o in objs if o.forced == "bundle target")
    assert [(x.catalog, x.id) for x in t.catalogs] == [("Gaia DR3", "1000000000000000001"),
                                                       ("AllWISE", "TGT_AW"), ("2MASS", "TGT_TM")]
    assert t.catalogs[1].sep_arcsec == pytest.approx(2.0, abs=0.05) and t.catalogs[1].mags["W1"] == 12.0
    assert t.detected and t.name == "Mini Target"
    for x, y in ((xa, ya), (xt, yt)):
        o = at(m, objs, x, y, tol=0.05)
        assert o.kind == "unidentified" and not o.catalogs
    assert sum(1 for o in objs for x in o.catalogs if x.id in ("TGT_AW", "TGT_TM")) == 2


# ------------------------------------------------------------ undetected note ---

def _masked_frames(mask_frames, n=4, pixel=(24, 24)):
    frames = _frames({"v1": [], "v2": []}, n=n // 2)
    out = []
    for k, f in enumerate(frames):
        data = f.data.copy()
        if k < mask_frames:
            data[pixel[1], pixel[0]] = np.nan
        out.append(Frame(f.band, f.visit, data))
    return out


NO_DET = "no detection above the S/N threshold in the frame stack"


def test_undetected_note_core_masked_vs_no_detection(mini):
    dets = [d for d in DETS if d.snr != 50.0]
    objs, _ = run(mini, dets=dets, frames=_masked_frames(2))   # 2 of 4 frames masked at the target pixel: 0.5
    t = next(o for o in objs if o.forced == "bundle target")
    assert t.detected is False and t.undetected_note == "core masked"
    objs, _ = run(mini, dets=dets, frames=_masked_frames(1))   # 0.25
    assert next(o for o in objs if o.forced == "bundle target").undetected_note == NO_DET
    objs, _ = run(mini, dets=dets, frames=[])                  # nothing to measure
    assert next(o for o in objs if o.forced == "bundle target").undetected_note == NO_DET


def test_undetected_note_is_null_for_detected_objects(mini):
    objs, _ = run(mini, frames=_masked_frames(4))
    assert all(o.undetected_note is None for o in objs if o.detected)


def test_undetected_note_for_the_comparison_star_uses_its_own_pixel(mini):
    dets = [d for d in DETS if d.snr != 40.0]
    frames = _masked_frames(4, pixel=(8, 40))                  # masked at the comparison star, not at the target
    objs, _ = run(mini, dets=dets, frames=frames)
    comp = next(o for o in objs if o.forced == "comparison star")
    tgt = next(o for o in objs if o.forced == "bundle target")
    assert comp.detected is False and comp.undetected_note == "core masked"
    assert tgt.detected and tgt.undetected_note is None
