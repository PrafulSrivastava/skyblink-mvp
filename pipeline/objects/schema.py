"""Python mirror of the shared `objects.json` schema (see lib/sky-objects.ts)."""
from __future__ import annotations

from dataclasses import dataclass, field
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
