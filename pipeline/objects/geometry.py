"""Pixel geometry for the 49x49 patch grids, plus linear proper-motion propagation."""
from __future__ import annotations

from functools import lru_cache
from typing import Mapping

import numpy as np
from astropy.wcs import WCS
from numpy.typing import ArrayLike

MJD_PER_YEAR = 365.25
_MAS_PER_DEG = 3.6e6


@lru_cache(maxsize=16)
def _wcs(crval1, crval2, cdelt1, cdelt2, crpix1, crpix2) -> WCS:
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [crval1, crval2]
    w.wcs.cdelt = [cdelt1, cdelt2]
    w.wcs.crpix = [crpix1, crpix2]
    w.wcs.cunit = ["deg", "deg"]
    w.wcs.radesys = "ICRS"
    w.wcs.equinox = 2000.0
    return w


def grid_wcs(grid: Mapping) -> WCS:
    """The patch grid WCS, built as `grid_wcs` in pipeline/longbaseline/stage3.py does."""
    return _wcs(*(float(grid[k]) for k in ("CRVAL1", "CRVAL2", "CDELT1", "CDELT2", "CRPIX1", "CRPIX2")))


def _out(a: np.ndarray, b: np.ndarray, scalar: bool):
    return (float(a), float(b)) if scalar else (a, b)


def radec_to_png(grid: Mapping, ra: ArrayLike, dec: ArrayLike) -> tuple[ArrayLike, ArrayLike]:
    """Sky (deg) -> png pixel centres (png_y = NAXIS2 - 1 - FITS y). Scalars in, floats out."""
    scalar = np.ndim(ra) == 0 and np.ndim(dec) == 0
    x, y = grid_wcs(grid).wcs_world2pix(np.asarray(ra, float), np.asarray(dec, float), 0)
    return _out(x, grid["NAXIS2"] - 1 - y, scalar)


def png_to_radec(grid: Mapping, png_x: ArrayLike, png_y: ArrayLike) -> tuple[ArrayLike, ArrayLike]:
    scalar = np.ndim(png_x) == 0 and np.ndim(png_y) == 0
    x = np.asarray(png_x, float)
    y = grid["NAXIS2"] - 1 - np.asarray(png_y, float)
    ra, dec = grid_wcs(grid).wcs_pix2world(x, y, 0)
    return _out(ra, dec, scalar)


def propagate(
    ra: ArrayLike, dec: ArrayLike, pmra_mas_yr: ArrayLike, pmdec_mas_yr: ArrayLike,
    from_mjd: float, to_mjd: float,
) -> tuple[ArrayLike, ArrayLike]:
    """Linear proper motion, no parallax. `pmra` already includes cos(dec)."""
    dt = (to_mjd - from_mjd) / MJD_PER_YEAR
    dec = np.asarray(dec, float) + np.asarray(pmdec_mas_yr, float) * dt / _MAS_PER_DEG
    ra = np.asarray(ra, float) + np.asarray(pmra_mas_yr, float) * dt / _MAS_PER_DEG / np.cos(np.radians(dec))
    return ra, dec


def sep_arcsec(ra1: ArrayLike, dec1: ArrayLike, ra2: ArrayLike, dec2: ArrayLike) -> ArrayLike:
    """Great-circle separation in arcsec (haversine, inputs in degrees)."""
    r1, d1, r2, d2 = (np.radians(np.asarray(v, float)) for v in (ra1, dec1, ra2, dec2))
    a = np.sin((d2 - d1) / 2) ** 2 + np.cos(d1) * np.cos(d2) * np.sin((r2 - r1) / 2) ** 2
    return np.degrees(2 * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))) * 3600.0
