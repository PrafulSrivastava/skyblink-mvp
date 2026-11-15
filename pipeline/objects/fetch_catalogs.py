"""Fetch IRSA Gator catalog cones and write trimmed CSV snapshots.

This is the only module in the sky-objects feature that touches the network.
"""
from __future__ import annotations

import csv
import json
import shutil
import sys
import time
from collections.abc import Sequence
from datetime import date

import requests
from astropy.io import ascii as apascii

from config import (
    CATALOG_DIR, CATALOGS, CONE_RADIUS_ARCSEC, DATA_DIR, GATOR_URL, PATCHES,
    ZERO_ROWS_ALLOWED,
)

RETRY_SLEEPS = (5, 15)


class FetchError(RuntimeError):
    pass


def build_query(table: str, ra: float, dec: float, radius_arcsec: float,
                columns: Sequence[str]) -> dict[str, str]:
    return {
        "catalog": table,
        "spatial": "cone",
        "objstr": f"{ra} {dec}",
        "radius": str(radius_arcsec),
        "radunits": "arcsec",
        "outfmt": "1",
        "selcols": ",".join(columns),
    }


def parse_gator_ipac(text: str, required: Sequence[str]
                     ) -> tuple[list[dict[str, str]], dict[str, str]]:
    """Parse a Gator IPAC table into (rows, units); null cells become ''."""
    if not text.startswith("\\") or "\\RowsRetrieved" not in text:
        raise FetchError(f"not a Gator IPAC table: {text[:200]!r}")
    expected = None
    for line in text.splitlines():
        if line.startswith("\\RowsRetrieved"):
            expected = int(line.split("=", 1)[1].strip())
            break
    if expected is None:
        raise FetchError("RowsRetrieved header not found")
    try:
        table = apascii.read(text, format="ipac")
    except Exception as exc:  # astropy raises several types on malformed input
        raise FetchError(f"cannot parse IPAC table: {exc}") from exc
    if len(table) != expected:
        raise FetchError(f"row count {len(table)} != RowsRetrieved {expected}")
    missing = [c for c in required if c not in table.colnames]
    if missing:
        raise FetchError(f"missing columns: {missing}")
    # astropy rewrites units ("arcsec/yr" -> "arcsec / yr"); keep IRSA's verbatim.
    header = [ln for ln in text.splitlines() if ln.startswith("|")]
    if len(header) < 3:
        raise FetchError("IPAC header lacks a units row")
    names = [c.strip() for c in header[0].strip("|").split("|")]
    unit_cells = [c.strip() for c in header[2].strip("|").split("|")]
    units = dict(zip(names, unit_cells))
    rows = []
    for r in table:
        row = {}
        for c in table.colnames:
            v = r[c]
            row[c] = "" if v is None or v is apascii.masked or (
                hasattr(v, "mask") and bool(v.mask)) else str(v)
        rows.append(row)
    return rows, units


def _patch_centre(patch: str) -> tuple[float, float]:
    grid = json.loads((DATA_DIR / patch / "target.json").read_text())["grid"]
    return float(grid["CRVAL1"]), float(grid["CRVAL2"])


def _fetch_table(session, spec, ra, dec, allow_zero=False):
    params = build_query(spec.table, ra, dec, CONE_RADIUS_ARCSEC, spec.columns)
    last: Exception | None = None
    for attempt in range(3):
        try:
            resp = session.get(GATOR_URL, params=params, timeout=60)
            if resp.status_code != 200:
                raise FetchError(f"HTTP {resp.status_code} from {GATOR_URL}")
            rows, units = parse_gator_ipac(resp.text, spec.columns)
            if spec.table == "catwise_2020" and units.get("pmra") != "arcsec/yr":
                raise FetchError(f"unexpected pmra unit {units.get('pmra')!r}")
            if not rows and not allow_zero:
                raise FetchError(f"zero rows for {spec.table}")
            return rows, units
        except (requests.RequestException, FetchError) as exc:
            last = exc
            if attempt < 2:
                time.sleep(RETRY_SLEEPS[attempt])
    raise FetchError(f"{spec.table} failed after 3 attempts: {last}")


def fetch_all(patches=PATCHES, out_dir=CATALOG_DIR,
              session: requests.Session | None = None,
              today: str | None = None) -> dict:
    session = session or requests.Session()
    today = today or date.today().isoformat()
    tmp = out_dir.parent / ".catalogs_tmp"
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir(parents=True)
    files = []
    try:
        for patch in patches:
            ra, dec = _patch_centre(patch)
            for key, spec in CATALOGS.items():
                t0 = time.time()
                rows, units = _fetch_table(
                    session, spec, ra, dec, (patch, key) in ZERO_ROWS_ALLOWED)
                name = f"{patch}_{key}.csv"
                with open(tmp / name, "w", newline="", encoding="utf-8") as fh:
                    w = csv.DictWriter(fh, fieldnames=spec.columns,
                                       extrasaction="ignore")
                    w.writeheader()
                    w.writerows(rows)
                files.append({
                    "patch": patch, "catalog": spec.label, "table": spec.table,
                    "file": name, "rows": len(rows),
                    "units": {c: units[c] for c in spec.columns},
                    "seconds": round(time.time() - t0, 1),
                })
                if not rows:
                    files[-1]["note"] = ZERO_ROWS_ALLOWED[(patch, key)]
        snap = {
            "service": GATOR_URL, "retrieved": today,
            "radius_arcsec": CONE_RADIUS_ARCSEC,
            "files": [{k: v for k, v in f.items() if k != "seconds"} for f in files],
        }
        (tmp / "snapshots.json").write_text(json.dumps(snap, indent=1) + "\n")
        out_dir.mkdir(parents=True, exist_ok=True)
        for p in tmp.iterdir():
            shutil.move(str(p), str(out_dir / p.name))
    except BaseException:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
    shutil.rmtree(tmp, ignore_errors=True)
    snap["_timings"] = {f["file"]: f["seconds"] for f in files}
    return snap


def main() -> int:
    try:
        snap = fetch_all()
    except FetchError as exc:
        print(f"fetch failed: {exc}", file=sys.stderr)
        return 1
    for f in snap["files"]:
        print(f["patch"], f["catalog"], f["rows"], snap["_timings"][f["file"]])
    return 0


if __name__ == "__main__":
    sys.exit(main())
