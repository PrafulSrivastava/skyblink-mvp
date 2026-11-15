"""Build `objects.json` for the five patches, add the manifest entries and write the counts report.

Offline: reads the committed catalog snapshots and the stored frames only.
CLI: `python make_objects.py [--patch ID ...]`, exit 0 if no guard failed, else 1.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Mapping, Sequence

from catalogs import load_allwise, load_catwise, load_snapshots, load_tmass
from config import (
    CATALOG_DIR, DATA_DIR, GUARD_MAX_MEDIAN_SEP_PX, GUARD_MAX_UNIDENTIFIED_FRACTION, PATCHES, REPORT_DIR,
    THRESHOLDS, WARN_UNIDENTIFIED_FRACTION,
)
from detect import detect_patch
from match import MatchStats, build_objects
from schema import CatalogSnapshot, ObjectCounts, ObjectsFile, to_json_dict

MOVING_TARGETS = ("barnards-star", "wise-0855")
WARN_BRIGHT_RECOVERY = 0.7
WARN_COMPARISON_OFFSET_PX = 1.0
COLUMNS = ("patch", "detected", "known", "unidentified", "moving", "forced_undetected", "unid_frac",
           "median_sep_px", "catwise_in_grid", "chance_per_circle", "bright_recovery", "comp_offset_px",
           "target_detected", "target_moving", "status")


def _snapshot_entries(patch: str, snapshots: dict) -> list[CatalogSnapshot]:
    return [CatalogSnapshot(e["catalog"], e["table"], e["file"], snapshots["retrieved"], e["rows"],
                            snapshots["radius_arcsec"], snapshots["service"])
            for e in snapshots["files"] if e["patch"] == patch]


def build_patch(patch: str, patch_dir: Path, catalog_dir: Path, snapshots: dict,
                th: Mapping[str, float]) -> tuple[ObjectsFile, MatchStats]:
    patch_dir, catalog_dir = Path(patch_dir), Path(catalog_dir)
    target = json.loads((patch_dir / "target.json").read_text(encoding="utf-8"))
    dets, labels, frames = detect_patch(patch_dir, target, th)
    objs, stats = build_objects(
        patch, target, dets, frames,
        load_catwise(catalog_dir / f"{patch}_catwise.csv"),
        load_allwise(catalog_dir / f"{patch}_allwise.csv"),
        load_tmass(catalog_dir / f"{patch}_2mass.csv"), th)
    counts = ObjectCounts(
        detected=sum(o.detected for o in objs),
        known=sum(o.kind == "known" for o in objs),
        unidentified=sum(o.kind == "unidentified" for o in objs),
        moving=sum(o.moving for o in objs),
        forced_undetected=sum(o.forced is not None and not o.detected for o in objs))
    f = ObjectsFile(
        patch=patch, generated=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        mean_epoch_mjd=target["mean_epoch"]["mjd"], detection_frames=labels,
        catalog_snapshots=_snapshot_entries(patch, snapshots), thresholds=dict(th), counts=counts, objects=objs)
    return f, stats


def _bundle_target(f: ObjectsFile):
    return next((o for o in f.objects if o.forced == "bundle target"), None)


def unid_fraction(f: ObjectsFile) -> float:
    return f.counts.unidentified / max(f.counts.detected, 1)


def guard_failures(patch: str, f: ObjectsFile, stats: MatchStats) -> list[str]:
    out = []
    frac = unid_fraction(f)
    if frac > GUARD_MAX_UNIDENTIFIED_FRACTION:
        out.append(f"G1 unidentified fraction {frac:.2f} > {GUARD_MAX_UNIDENTIFIED_FRACTION}")
    if stats.median_sep_px is not None and stats.median_sep_px > GUARD_MAX_MEDIAN_SEP_PX:
        out.append(f"G2 median CatWISE separation {stats.median_sep_px:.2f} px > {GUARD_MAX_MEDIAN_SEP_PX}")
    t = _bundle_target(f)
    if t is None or t.kind != "known":
        out.append("G3 bundle target missing or not known")
    elif patch in MOVING_TARGETS and not t.moving:
        out.append("G4 bundle target is not flagged moving")
    return out


def guard_warnings(patch: str, f: ObjectsFile, stats: MatchStats) -> list[str]:
    out = []
    frac = unid_fraction(f)
    if frac > WARN_UNIDENTIFIED_FRACTION:
        out.append(f"{patch}: unidentified fraction {frac:.2f} > {WARN_UNIDENTIFIED_FRACTION}")
    if stats.bright_recovery is not None and stats.bright_recovery < WARN_BRIGHT_RECOVERY:
        out.append(f"{patch}: bright CatWISE recovery {stats.bright_recovery:.2f} < {WARN_BRIGHT_RECOVERY}")
    if stats.comparison_offset_px is not None and stats.comparison_offset_px > WARN_COMPARISON_OFFSET_PX:
        out.append(f"{patch}: comparison star offset {stats.comparison_offset_px:.2f} px > {WARN_COMPARISON_OFFSET_PX}")
    if not stats.target_detected:
        out.append(f"{patch}: bundle target not detected (forced at its catalog position)")
    return out


def add_objects_to_manifest(manifest_text: str, patches: Sequence[str]) -> str:
    d = json.loads(manifest_text)
    for i, t in enumerate(d["targets"]):
        if t["id"] not in patches:
            continue
        path = f"{t['id']}/objects.json"
        if "objects" in t:
            t["objects"] = path
            continue
        new = {}
        for k, v in t.items():
            new[k] = v
            if k == "spectrum":
                new["objects"] = path
        d["targets"][i] = new
    return json.dumps(d, indent=1)


def _fmt(v) -> str:
    if v is None:
        return "-"
    if isinstance(v, bool):
        return str(v)
    if isinstance(v, float):
        return f"{v:.3f}"
    return str(v)


def format_counts(rows: list[dict], thresholds: Mapping[str, float] | None = None, retrieved: str = "") -> str:
    cells = [[_fmt(r.get(c)) for c in COLUMNS] for r in rows]
    widths = [max([len(c)] + [len(r[i]) for r in cells]) for i, c in enumerate(COLUMNS)]

    def line(vals):
        return "  ".join(v.ljust(w) for v, w in zip(vals, widths)).rstrip()

    out = [line(COLUMNS)] + [line(r) for r in cells]
    out.append("# thresholds: " + json.dumps(dict(thresholds if thresholds is not None else THRESHOLDS)))
    out.append(f"# snapshots retrieved: {retrieved}")
    out += [f"# warn {w}" for r in rows for w in r.get("warnings", [])]
    return "\n".join(out) + "\n"


def counts_row(patch: str, f: ObjectsFile, stats: MatchStats, failures: list[str], warnings: list[str]) -> dict:
    t = _bundle_target(f)
    return dict(
        patch=patch, detected=f.counts.detected, known=f.counts.known, unidentified=f.counts.unidentified,
        moving=f.counts.moving, forced_undetected=f.counts.forced_undetected, unid_frac=unid_fraction(f),
        median_sep_px=stats.median_sep_px, catwise_in_grid=stats.n_catwise_in_grid,
        chance_per_circle=stats.chance_per_circle, bright_recovery=stats.bright_recovery,
        comp_offset_px=stats.comparison_offset_px, target_detected=stats.target_detected,
        target_moving=bool(t and t.moving), status="PASS" if not failures else "FAIL: " + "; ".join(failures),
        warnings=warnings)


def _write_manifest(patches: Sequence[str]) -> None:
    path = DATA_DIR / "manifest.json"
    raw = path.read_bytes().decode("utf-8")
    nl = "\r\n" if "\r\n" in raw else "\n"  # keep the working tree's line endings
    out = add_objects_to_manifest(raw.replace("\r\n", "\n"), patches)
    path.write_bytes(out.replace("\n", nl).encode("utf-8"))


def main(argv: Sequence[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--patch", action="append", choices=PATCHES, help="patch id (repeatable); default all five")
    patches = ap.parse_args(argv).patch or list(PATCHES)
    snapshots = load_snapshots()
    results, rows, failed = {}, [], False
    for p in patches:
        f, stats = build_patch(p, DATA_DIR / p, CATALOG_DIR, snapshots, THRESHOLDS)
        fails, warns = guard_failures(p, f, stats), guard_warnings(p, f, stats)
        failed |= bool(fails)
        results[p] = f
        rows.append(counts_row(p, f, stats, fails, warns))
    REPORT_DIR.mkdir(exist_ok=True)
    text = format_counts(rows, THRESHOLDS, snapshots["retrieved"])
    (REPORT_DIR / "counts.txt").write_text(text, encoding="utf-8", newline="\n")
    sys.stdout.write(text)
    if failed:
        print("guard failure: objects.json and manifest not written", file=sys.stderr)
        return 1
    for p, f in results.items():
        body = json.dumps(to_json_dict(f), indent=1, ensure_ascii=False, allow_nan=False)
        (DATA_DIR / p / "objects.json").write_text(body, encoding="utf-8", newline="\n")
    _write_manifest(patches)
    return 0


if __name__ == "__main__":
    sys.exit(main())
