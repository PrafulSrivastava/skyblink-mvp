"""Python mirror of the shared `objects.json` schema (see lib/sky-objects.ts)."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Literal

ObjectKind = Literal["known", "unidentified"]
MotionBasis = Literal["catalog", "image", "none"]
CatalogName = Literal["CatWISE2020", "AllWISE", "2MASS", "Gaia DR3"]
MagBand = Literal["W1", "W2", "W3", "J", "H", "K", "G"]
ForcedReason = Literal["bundle target", "comparison star"]


@dataclass
class PixelPos:
    png_x: float
    png_y: float


@dataclass
class CatalogMatch:
    catalog: CatalogName
    id: str
    sep_arcsec: float | None
    mags: dict[str, float] = field(default_factory=dict)


@dataclass
class ProperMotion:  # mas/yr, pmra includes cos(dec)
    pmra: float | None
    pmdec: float | None
    total: float
    total_err: float | None


@dataclass
class SkyObject:
    id: str  # "<patch>-NNN", NNN 1-based in output order
    kind: ObjectKind
    moving: bool
    motion_basis: MotionBasis
    reason: str
    name: str
    catalogs: list[CatalogMatch]
    pm_mas_yr: ProperMotion | None
    ra: float  # detection (or forced catalog) position at mean epoch, deg
    dec: float
    catalog_ra: float | None  # primary catalog position at mean epoch
    catalog_dec: float | None
    snr: float | None  # None when not detected
    detected: bool
    forced: ForcedReason | None
    image_shift_px: float | None  # first -> last full visit, unidentified objects only
    positions: dict[str, PixelPos]  # key = every visit id in target.json visits
    undetected_note: str | None = None  # why a forced object is not detected ("core masked" or no detection)


@dataclass
class CatalogSnapshot:
    catalog: CatalogName
    table: str
    file: str
    retrieved: str
    rows: int
    radius_arcsec: float
    service: str


@dataclass
class ObjectCounts:
    detected: int
    known: int
    unidentified: int
    moving: int
    forced_undetected: int


@dataclass(kw_only=True)  # `version` has a default but comes first in the shared schema
class ObjectsFile:
    version: int = 1
    patch: str
    generated: str
    mean_epoch_mjd: float
    detection_frames: list[str]  # "D2/v1" labels
    catalog_snapshots: list[CatalogSnapshot]
    thresholds: dict[str, float]
    counts: ObjectCounts
    objects: list[SkyObject]


def _r(v: float | None, nd: int) -> float | None:
    return None if v is None else round(float(v), nd)


def to_json_dict(f: ObjectsFile) -> dict:
    """Plain-dict form of the file with the shared schema's rounding rules (png 3 dp, ra/dec 7 dp,
    snr 1 dp, pm 1 dp, sep 2 dp, mags 3 dp, image_shift 2 dp). NaN is left alone; `json.dumps(allow_nan=False)`
    rejects it at write time."""
    d = asdict(f)
    for o in d["objects"]:
        o["ra"], o["dec"] = _r(o["ra"], 7), _r(o["dec"], 7)
        o["catalog_ra"], o["catalog_dec"] = _r(o["catalog_ra"], 7), _r(o["catalog_dec"], 7)
        o["snr"] = _r(o["snr"], 1)
        o["image_shift_px"] = _r(o["image_shift_px"], 2)
        if o["pm_mas_yr"] is not None:
            o["pm_mas_yr"] = {k: _r(v, 1) for k, v in o["pm_mas_yr"].items()}
        for c in o["catalogs"]:
            c["sep_arcsec"] = _r(c["sep_arcsec"], 2)
            c["mags"] = {k: _r(v, 3) for k, v in c["mags"].items()}
        o["positions"] = {v: {"png_x": _r(p["png_x"], 3), "png_y": _r(p["png_y"], 3)}
                          for v, p in o["positions"].items()}
    return d
