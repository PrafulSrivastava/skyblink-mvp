"""Loaders for the committed catalog snapshots (CSV, IRSA column names/units)."""
from __future__ import annotations

import csv
import json
import math
from dataclasses import dataclass
from pathlib import Path

from config import ALLWISE_DEFAULT_EPOCH_MJD, CATALOG_DIR

_ARTIFACT_FLAGS = set("DPHO")


@dataclass(frozen=True)
class CatwiseRow:
    name: str
    ra: float
    dec: float
    pmra: float
    pmdec: float
    sigpm: float
    w1: float | None
    w2: float | None
    cc_flags: str
    ab_flags: str


@dataclass(frozen=True)
class AllwiseRow:
    name: str
    ra: float
    dec: float
    epoch_mjd: float
    w1: float | None
    w2: float | None
    w3: float | None


@dataclass(frozen=True)
class TmassRow:
    name: str
    ra: float
    dec: float
    epoch_mjd: float
    j: float | None
    h: float | None
    k: float | None


def _f(s: str | None) -> float | None:
    s = (s or "").strip()
    if s == "" or s.lower() in ("null", "nan"):
        return None
    return float(s)


def _read(path: Path) -> list[dict[str, str]]:
    with open(path, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def _flags(s: str | None) -> str:
    s = (s or "").strip()
    return "" if s.lower() == "null" else s


def _artifact(cc: str) -> bool:
    # Uppercase D/P/H/O in the first two (W1, W2) positions = confirmed artifact.
    return any(ch in _ARTIFACT_FLAGS for ch in cc[:2])


def load_catwise(path: Path) -> list[CatwiseRow]:
    out = []
    for r in _read(path):
        ra, dec = _f(r["ra_pm"]), _f(r["dec_pm"])
        pmra, pmdec = _f(r["pmra"]), _f(r["pmdec"])
        if None in (ra, dec, pmra, pmdec):
            continue
        w1, w2 = _f(r["w1mpro"]), _f(r["w2mpro"])
        if w1 is None and w2 is None:
            continue
        if max(_f(r["w1snr"]) or 0.0, _f(r["w2snr"]) or 0.0) < 5:
            continue
        cc = _flags(r["cc_flags"])
        if _artifact(cc):
            continue
        sx, sy = _f(r["sigpmra"]) or 0.0, _f(r["sigpmdec"]) or 0.0
        out.append(CatwiseRow(
            name=r["source_name"], ra=ra, dec=dec,
            pmra=pmra * 1000.0, pmdec=pmdec * 1000.0,
            sigpm=math.hypot(sx, sy) * 1000.0, w1=w1, w2=w2,
            cc_flags=cc, ab_flags=_flags(r["ab_flags"])))
    return out


def load_allwise(path: Path) -> list[AllwiseRow]:
    out = []
    for r in _read(path):
        ra, dec = _f(r["ra"]), _f(r["dec"])
        if ra is None or dec is None or _artifact(_flags(r["cc_flags"])):
            continue
        epoch = _f(r["w1mjdmean"])
        out.append(AllwiseRow(
            name=r["designation"], ra=ra, dec=dec,
            epoch_mjd=ALLWISE_DEFAULT_EPOCH_MJD if epoch is None else epoch,
            w1=_f(r["w1mpro"]), w2=_f(r["w2mpro"]), w3=_f(r["w3mpro"])))
    return out


def load_tmass(path: Path) -> list[TmassRow]:
    out = []
    for r in _read(path):
        ra, dec = _f(r["ra"]), _f(r["dec"])
        if ra is None or dec is None:
            continue
        jd = _f(r["jdate"])
        out.append(TmassRow(
            name=r["designation"], ra=ra, dec=dec,
            epoch_mjd=(jd - 2400000.5) if jd is not None else math.nan,
            j=_f(r["j_m"]), h=_f(r["h_m"]), k=_f(r["k_m"])))
    return out


def load_snapshots(path: Path = CATALOG_DIR / "snapshots.json") -> dict:
    return json.loads(Path(path).read_text())
