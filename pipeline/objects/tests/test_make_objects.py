import dataclasses
import difflib
import json
import re
import shutil
from pathlib import Path

import numpy as np
import pytest

from config import DATA_DIR, NPIX, PATCHES, THRESHOLDS
from make_objects import (
    add_objects_to_manifest,
    build_patch,
    format_counts,
    guard_failures,
    guard_warnings,
)
from match import MatchStats
from schema import ObjectCounts, ObjectsFile, PixelPos, ProperMotion, SkyObject, to_json_dict

FIX = Path(__file__).parent / "fixtures"

SCHEMA_KEYS = {"version", "patch", "generated", "mean_epoch_mjd", "detection_frames", "catalog_snapshots",
               "thresholds", "counts", "objects"}
OBJECT_KEYS = {"id", "kind", "moving", "motion_basis", "reason", "name", "catalogs", "pm_mas_yr", "ra", "dec",
               "catalog_ra", "catalog_dec", "snr", "detected", "forced", "image_shift_px", "positions",
               "undetected_note"}
# the ObjectThresholds fields of the shared schema (lib/sky-objects.ts), spelled out on purpose
THRESHOLD_KEYS = {
    "detect_snr", "min_sep_px", "edge_margin_px", "min_frames", "halo_dilate_px",
    "match_radius_px", "match_radius_arcsec", "forced_radius_px",
    "link_radius_arcsec", "link_radius_max_arcsec",
    "moving_pm_mas_yr", "moving_pm_min_significance",
    "image_shift_min_px", "image_shift_min_snr", "target_absorb_radius_arcsec",
}

YY, XX = np.mgrid[0:NPIX, 0:NPIX]


# ------------------------------------------------------------------ helpers ---

def sky_obj(**over) -> SkyObject:
    base = dict(
        id="x-001", kind="known", moving=False, motion_basis="catalog", reason="r", name="n", catalogs=[],
        pm_mas_yr=None, ra=1.0, dec=2.0, catalog_ra=1.0, catalog_dec=2.0, snr=10.0, detected=True, forced=None,
        image_shift_px=None, positions={"v1": PixelPos(1.0, 2.0)},
    )
    base.update(over)
    return SkyObject(**base)


def make_file(objects: list[SkyObject], **count_over) -> ObjectsFile:
    detected = sum(o.detected for o in objects)
    counts = dict(
        detected=detected,
        known=sum(o.kind == "known" for o in objects),
        unidentified=sum(o.kind == "unidentified" for o in objects),
        moving=sum(o.moving for o in objects),
        forced_undetected=sum(o.forced is not None and not o.detected for o in objects),
    )
    counts.update(count_over)
    return ObjectsFile(
        patch="x", generated="2026-11-15T00:00:00Z", mean_epoch_mjd=61000.0, detection_frames=["D1/v1"],
        catalog_snapshots=[], thresholds=dict(THRESHOLDS), counts=ObjectCounts(**counts), objects=objects)


def target_obj(moving=True, kind="known", detected=True) -> SkyObject:
    return sky_obj(forced="bundle target", moving=moving, kind=kind, detected=detected,
                   snr=20.0 if detected else None)


def file_with(detected: int, unidentified: int, target=True) -> ObjectsFile:
    objs = [target_obj()] if target else []
    objs += [sky_obj(kind="unidentified", motion_basis="none") for _ in range(unidentified)]
    return make_file(objs, detected=detected, unidentified=unidentified,
                     known=len(objs) - unidentified)


STATS_OK = MatchStats(
    median_sep_px=0.2, n_catwise_in_grid=5, chance_per_circle=0.1, bright_recovery=1.0, n_absorbed=0,
    shift_floor_px=0.5, comparison_offset_px=0.1, target_detected=True)


def stats_with(**over) -> MatchStats:
    return dataclasses.replace(STATS_OK, **over)


def draw(sources, seed):
    rng = np.random.default_rng(seed)
    clean = sum((a * np.exp(-((XX - x) ** 2 + (YY - y) ** 2) / (2 * 0.6 ** 2)) for x, y, a in sources),
                np.zeros((NPIX, NPIX)))
    return (clean + rng.normal(0.0, 1.0, (NPIX, NPIX))).astype("<f4")


def write_minipatch(tmp_path: Path):
    """tmp/patch (target.json + synthetic .f32 for D1,D2 x v1,v2) and tmp/catalogs (mini CSVs)."""
    patch_dir, catalog_dir = tmp_path / "patch", tmp_path / "catalogs"
    patch_dir.mkdir()
    catalog_dir.mkdir()
    target = json.loads((FIX / "mini_target.json").read_text())
    target["paths"] = {b: {v: {"f32": f"frames/{b}/{v}.f32"} for v in ("v1", "v2")} for b in ("D1", "D2")}
    (patch_dir / "target.json").write_text(json.dumps(target))
    static = [(8.0, 40.0, 8.0),    # comparison star
              (10.0, 10.0, 8.0),   # C1, static CatWISE
              (30.0, 15.0, 8.0),   # C2, CatWISE fast mover
              (40.0, 40.0, 8.0),   # A1, AllWISE only
              (20.0, 40.0, 8.0),   # T1, 2MASS only
              (35.0, 30.0, 8.0)]   # nothing in any catalog
    seed = 0
    for band in ("D1", "D2"):
        (patch_dir / "frames" / band).mkdir(parents=True)
        for v in target["visits"]:
            seed += 1
            tx, ty = v["target_px"]["png_x"], v["target_px"]["png_y"]
            data = draw(static + [(tx, ty, 12.0)], seed)
            data.tofile(patch_dir / "frames" / band / f"{v['id']}.f32")
    for cat in ("catwise", "allwise", "2mass"):
        shutil.copy(FIX / f"mini_{cat}.csv", catalog_dir / f"mini_{cat}.csv")
    snapshots = {
        "service": "https://example.invalid/gator", "retrieved": "2026-11-15", "radius_arcsec": 300.0,
        "files": [
            {"patch": "mini", "catalog": "CatWISE2020", "table": "catwise_2020", "file": "mini_catwise.csv",
             "rows": 8},
            {"patch": "mini", "catalog": "AllWISE", "table": "allwise_p3as_psd", "file": "mini_allwise.csv",
             "rows": 2},
            {"patch": "mini", "catalog": "2MASS", "table": "fp_psc", "file": "mini_2mass.csv", "rows": 2},
            {"patch": "other", "catalog": "2MASS", "table": "fp_psc", "file": "other_2mass.csv", "rows": 9},
        ],
    }
    return patch_dir, catalog_dir, snapshots


# -------------------------------------------------------------- build_patch ---

def test_end_to_end_minipatch(tmp_path):
    patch_dir, catalog_dir, snapshots = write_minipatch(tmp_path)
    f, stats = build_patch("mini", patch_dir, catalog_dir, snapshots, THRESHOLDS)
    d = to_json_dict(f)
    assert set(d) == SCHEMA_KEYS and all(set(o) == OBJECT_KEYS for o in d["objects"])
    assert set(d["thresholds"]) == THRESHOLD_KEYS and d["version"] == 1
    assert d["counts"]["known"] + d["counts"]["unidentified"] == len(d["objects"])
    assert all(set(o["positions"]) == {"v1", "v2"} for o in d["objects"])
    assert "NaN" not in json.dumps(d, allow_nan=False)

    assert d["patch"] == "mini" and d["mean_epoch_mjd"] == 61000.0
    assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", d["generated"])
    assert d["detection_frames"] == ["D1/v1", "D1/v2", "D2/v1", "D2/v2"]
    # only this patch's snapshot entries, in snapshots.json order, with the shared fields filled in
    assert [(s["catalog"], s["file"], s["rows"]) for s in d["catalog_snapshots"]] == [
        ("CatWISE2020", "mini_catwise.csv", 8), ("AllWISE", "mini_allwise.csv", 2), ("2MASS", "mini_2mass.csv", 2)]
    assert all(s["retrieved"] == "2026-11-15" and s["radius_arcsec"] == 300.0
               and s["service"] == "https://example.invalid/gator" for s in d["catalog_snapshots"])

    # the synthetic sky: bundle target, comparison star, 4 other known sources, 1 unidentified source
    assert stats.target_detected and stats.median_sep_px is not None and stats.median_sep_px < 0.6
    targets = [o for o in d["objects"] if o["forced"] == "bundle target"]
    assert len(targets) == 1 and targets[0]["kind"] == "known" and targets[0]["detected"]
    assert d["counts"]["unidentified"] == 1 and d["counts"]["forced_undetected"] == 0
    assert d["counts"]["detected"] == 7
    unid = [o for o in d["objects"] if o["kind"] == "unidentified"]
    assert [o["name"] for o in unid] == ["Unidentified #001"] and unid[0]["catalogs"] == []
    assert abs(unid[0]["positions"]["v1"]["png_x"] - 35.0) < 0.5 and abs(unid[0]["positions"]["v1"]["png_y"] - 30.0) < 0.5
    snrs = [o["snr"] for o in d["objects"] if o["detected"]]
    assert snrs == sorted(snrs, reverse=True)
    assert guard_failures("mini", f, stats) == []
    assert d["counts"]["moving"] == sum(o["moving"] for o in d["objects"])


def test_json_dict_carries_undetected_note():
    objs = [sky_obj(), sky_obj(forced="bundle target", detected=False, snr=None, undetected_note="core masked")]
    d = to_json_dict(make_file(objs))["objects"]
    assert d[0]["undetected_note"] is None and d[1]["undetected_note"] == "core masked"
    assert json.loads(json.dumps(d))[1]["undetected_note"] == "core masked"


def test_json_dict_rounding_and_nan(tmp_path):
    o = sky_obj(
        ra=269.446374212345, dec=4.768683123456, catalog_ra=269.446374299999, catalog_dec=4.7686839999,
        snr=12.3456, image_shift_px=1.23456, pm_mas_yr=ProperMotion(-801.5509, 10362.3942, 10393.1234, 0.1234),
        positions={"v1": PixelPos(24.09712, 23.16099)},
        catalogs=[])
    d = to_json_dict(make_file([o]))["objects"][0]
    assert (d["ra"], d["dec"], d["catalog_ra"], d["catalog_dec"]) == (269.4463742, 4.7686831, 269.4463743, 4.768684)
    assert d["snr"] == 12.3 and d["image_shift_px"] == 1.23
    assert d["pm_mas_yr"] == {"pmra": -801.6, "pmdec": 10362.4, "total": 10393.1, "total_err": 0.1}
    assert d["positions"]["v1"] == {"png_x": 24.097, "png_y": 23.161}
    bad = sky_obj(ra=float("nan"))
    with pytest.raises(ValueError):
        json.dumps(to_json_dict(make_file([bad])), allow_nan=False)


# ------------------------------------------------------------------- guards ---

def test_guard_majority_unidentified():
    assert any("G1" in m for m in guard_failures("x", file_with(detected=10, unidentified=6), STATS_OK))
    assert not any("G1" in m for m in guard_failures("x", file_with(detected=10, unidentified=5), STATS_OK))


def test_guard_misalignment():
    ok = file_with(detected=10, unidentified=1)
    assert any("G2" in m for m in guard_failures("x", ok, stats_with(median_sep_px=0.9)))
    assert not any("G2" in m for m in guard_failures("x", ok, stats_with(median_sep_px=0.6)))
    assert guard_failures("x", ok, STATS_OK) == []


def test_guard_bundle_target():
    no_target = file_with(detected=10, unidentified=1, target=False)
    assert any("G3" in m for m in guard_failures("x", no_target, STATS_OK))
    not_known = make_file([target_obj(kind="unidentified")])
    assert any("G3" in m for m in guard_failures("x", not_known, STATS_OK))


def test_guard_moving_targets():
    assert any("G4" in m for m in guard_failures("barnards-star", make_file([target_obj(moving=False)]), STATS_OK))
    assert any("G4" in m for m in guard_failures("wise-0855", make_file([target_obj(moving=False)]), STATS_OK))
    assert not any("G4" in m for m in guard_failures("rw-aur", make_file([target_obj(moving=False)]), STATS_OK))
    assert guard_failures("barnards-star", make_file([target_obj(moving=True)]), STATS_OK) == []


def test_guard_warnings():
    assert guard_warnings("x", file_with(detected=10, unidentified=1), STATS_OK) == []
    w = guard_warnings("x", file_with(detected=10, unidentified=3), STATS_OK)
    assert any("unidentified" in m for m in w)
    assert any("bright" in m for m in guard_warnings("x", file_with(10, 1), stats_with(bright_recovery=0.5)))
    assert any("comparison" in m for m in guard_warnings("x", file_with(10, 1), stats_with(comparison_offset_px=1.5)))
    assert any("not detected" in m for m in guard_warnings("x", file_with(10, 1), stats_with(target_detected=False)))
    # no CatWISE rows (R Dra): None statistics produce neither a crash nor a warning
    assert guard_warnings("x", file_with(10, 1), stats_with(bright_recovery=None, comparison_offset_px=None)) == []
    assert guard_failures("x", file_with(10, 1), stats_with(median_sep_px=None)) == []


# ----------------------------------------------------------------- manifest ---

def manifest_without_objects() -> str:
    """The committed manifest as it was before generation (also valid once the objects keys are present)."""
    src = (DATA_DIR / "manifest.json").read_text(encoding="utf-8")
    assert json.dumps(json.loads(src), indent=1) == src  # the writer's output format round-trips the file
    d = json.loads(src)
    for t in d["targets"]:
        t.pop("objects", None)
    return json.dumps(d, indent=1)


def test_manifest_insert_is_minimal_and_idempotent():
    src = manifest_without_objects()
    out = add_objects_to_manifest(src, PATCHES)
    added = [l for l in difflib.ndiff(src.splitlines(), out.splitlines()) if l.startswith(("+ ", "- "))]
    assert len(added) == 5 and all(l[2:].strip().startswith('"objects": "') for l in added)
    assert all(l.startswith("+ ") for l in added)
    d = json.loads(out)
    for t in d["targets"]:
        keys = list(t)
        assert t["objects"] == f"{t['id']}/objects.json" and keys.index("objects") == keys.index("spectrum") + 1
    assert add_objects_to_manifest(out, PATCHES) == out
    assert not out.endswith("\n")


def test_manifest_subset_only_touches_listed_patches():
    src = manifest_without_objects()
    d = json.loads(add_objects_to_manifest(src, ["rw-aur"]))
    assert [t["id"] for t in d["targets"] if "objects" in t] == ["rw-aur"]


# ------------------------------------------------------------------- counts ---

def row(patch="p", **over):
    r = dict(patch=patch, detected=40, known=36, unidentified=5, moving=2, forced_undetected=1, unid_frac=0.125,
             median_sep_px=0.21, catwise_in_grid=30, chance_per_circle=0.4, bright_recovery=0.9,
             comp_offset_px=0.3, target_detected=True, target_moving=True, status="PASS", warnings=[])
    r.update(over)
    return r


def test_format_counts():
    rows = [row("barnards-star"), row("r-dra", median_sep_px=None, bright_recovery=None, comp_offset_px=None,
                                      status="FAIL: G1", warnings=["r-dra: target not detected"])]
    text = format_counts(rows, thresholds=THRESHOLDS, retrieved="2026-11-15")
    lines = text.splitlines()
    assert lines[0].split() == ["patch", "detected", "known", "unidentified", "moving", "forced_undetected",
                                "unid_frac", "median_sep_px", "catwise_in_grid", "chance_per_circle",
                                "bright_recovery", "comp_offset_px", "target_detected", "target_moving", "status"]
    body = [l for l in lines[1:] if not l.startswith("#")]
    assert len(body) == 2 and body[0].split()[:3] == ["barnards-star", "40", "36"]
    assert len(body[0].split()) == 15 and body[0].split()[-1] == "PASS"
    assert "-" in body[1].split() and body[1].split("  ")[-1].strip() == "FAIL: G1"
    # fixed width: columns start at the same offsets in every line
    for name, value in (("detected", "40"), ("known", "36"), ("unidentified", "5"), ("status", "PASS")):
        assert body[0][lines[0].index(name):].startswith(value), name
    assert body[1][lines[0].index("median_sep_px"):].startswith("-")
    th_line = next(l for l in lines if l.startswith("# thresholds:"))
    assert json.loads(th_line.split(":", 1)[1]) == THRESHOLDS
    assert any(l == "# snapshots retrieved: 2026-11-15" for l in lines)
    assert "# warn r-dra: target not detected" in lines
