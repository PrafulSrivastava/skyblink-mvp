"""Shared constants for the sky-objects pipeline."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "public" / "data"
OBJ_DIR = Path(__file__).resolve().parent
CATALOG_DIR = OBJ_DIR / "catalogs"
REPORT_DIR = OBJ_DIR / "reports"

PATCHES = ("barnards-star", "eps-indi-b", "wise-0855", "rw-aur", "r-dra")
NPIX = 49
PIXEL_SCALE_ARCSEC = 6.15
CONE_RADIUS_ARCSEC = 300.0
CATWISE_EPOCH_MJD = 57170.0
ALLWISE_DEFAULT_EPOCH_MJD = 55400.0
GATOR_URL = "https://irsa.ipac.caltech.edu/cgi-bin/Gator/nph-query"


@dataclass(frozen=True)
class CatalogSpec:
    label: str
    table: str
    columns: tuple[str, ...]


CATALOGS: dict[str, CatalogSpec] = {
    "catwise": CatalogSpec(
        "CatWISE2020",
        "catwise_2020",
        (
            "source_name", "ra", "dec", "ra_pm", "dec_pm", "pmra", "pmdec",
            "sigpmra", "sigpmdec", "w1mpro", "w2mpro", "w1snr", "w2snr",
            "nb", "na", "cc_flags", "ab_flags", "pmcode", "meanobsmjd",
        ),
    ),
    "allwise": CatalogSpec(
        "AllWISE",
        "allwise_p3as_psd",
        (
            "designation", "ra", "dec", "w1mpro", "w2mpro", "w3mpro",
            "w1snr", "w2snr", "cc_flags", "ext_flg", "ph_qual", "w1mjdmean",
        ),
    ),
    "2mass": CatalogSpec(
        "2MASS",
        "fp_psc",
        ("designation", "ra", "dec", "j_m", "h_m", "k_m", "ph_qual", "cc_flg", "jdate"),
    ),
}

THRESHOLDS: dict[str, float] = {
    "detect_snr": 5.0,
    "min_sep_px": 2.0,
    "edge_margin_px": 2,
    "min_frames": 3,
    "halo_dilate_px": 1,
    "match_radius_px": 1.5,
    "match_radius_arcsec": 9.225,
    "forced_radius_px": 2.0,
    "link_radius_arcsec": 3.0,
    "link_radius_max_arcsec": 6.0,
    "moving_pm_mas_yr": 1000.0,
    "moving_pm_min_significance": 5.0,
    "image_shift_min_px": 1.0,
    "image_shift_min_snr": 10.0,
    "target_absorb_radius_arcsec": 20.0,
}

GUARD_MAX_UNIDENTIFIED_FRACTION = 0.5
GUARD_MAX_MEDIAN_SEP_PX = 0.6
WARN_UNIDENTIFIED_FRACTION = 0.25

# (patch, catalog key) pairs for which a well-formed zero-row response is genuine.
ZERO_ROWS_ALLOWED: dict[tuple[str, str], str] = {
    ("r-dra", "catwise"): "CatWISE2020 has no sources within 300 arcsec of R Dra (bright-star hole)",
}
