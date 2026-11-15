"""Source detection on the stored 49x49 .f32 frames (row 0 north, NaN = masked)."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Sequence

import numpy as np
from scipy.ndimage import binary_dilation, maximum_filter

from config import NPIX


@dataclass(frozen=True)
class Frame:
    band: str
    visit: str
    data: np.ndarray


@dataclass(frozen=True)
class Detection:
    png_x: float
    png_y: float
    snr: float


def load_frames(patch_dir: Path, target: dict) -> list[Frame]:
    frames: list[Frame] = []
    for band, visits in target["paths"].items():
        for visit, entry in visits.items():
            if visit == "diff":
                continue
            raw = np.fromfile(Path(patch_dir) / entry["f32"], dtype="<f4")
            if raw.size != NPIX * NPIX:
                raise ValueError(f"{band}/{visit}: expected {NPIX * NPIX} values, got {raw.size}")
            data = raw.reshape(NPIX, NPIX).astype(np.float32)
            data[~np.isfinite(data)] = np.nan
            frames.append(Frame(band, visit, data))
    return frames


def normalize_frame(data: np.ndarray) -> np.ndarray:
    bad = np.full(data.shape, np.nan, dtype=np.float32)
    finite = np.isfinite(data)
    if finite.sum() < 50:
        return bad
    keep = finite
    for _ in range(3):
        vals = data[keep]
        m = np.median(vals)
        sigma = 1.4826 * np.median(np.abs(vals - m))
        if not sigma > 0:
            return bad
        keep = finite & (np.abs(data - m) < 3 * sigma)
        if keep.sum() < 50:
            return bad
    return ((data - m) / sigma).astype(np.float32)


def detection_map(frames: Sequence[Frame], min_frames: int) -> np.ndarray:
    z = np.stack([normalize_frame(f.data) for f in frames])
    n = np.isfinite(z).sum(axis=0)
    with np.errstate(invalid="ignore", divide="ignore"):
        s = np.nansum(z, axis=0) / np.sqrt(n)
    s[n < min_frames] = np.nan
    return s


def bad_fraction(frames: Sequence[Frame]) -> np.ndarray:
    return np.mean([~np.isfinite(f.data) for f in frames], axis=0)


def _centroid(s: np.ndarray, py: int, px: int) -> tuple[float, float]:
    y0, y1 = max(py - 1, 0), min(py + 2, s.shape[0])
    x0, x1 = max(px - 1, 0), min(px + 2, s.shape[1])
    w = np.clip(np.nan_to_num(s[y0:y1, x0:x1], nan=0.0), 0, None)
    tot = w.sum()
    if tot <= 0:
        return float(px), float(py)
    yy, xx = np.mgrid[y0:y1, x0:x1]
    return float((w * xx).sum() / tot), float((w * yy).sum() / tot)


def find_sources(
    snr_map: np.ndarray,
    badfrac: np.ndarray,
    *,
    threshold: float,
    min_sep_px: float,
    edge_margin_px: int,
    halo_dilate_px: int,
) -> list[Detection]:
    r = int(np.floor(min_sep_px))
    gy, gx = np.mgrid[-r:r + 1, -r:r + 1]
    footprint = np.hypot(gx, gy) <= min_sep_px
    local_max = maximum_filter(np.where(np.isfinite(snr_map), snr_map, -np.inf),
                               footprint=footprint, mode="constant", cval=-np.inf)
    halo = binary_dilation(badfrac >= 0.5, iterations=halo_dilate_px) if halo_dilate_px > 0 \
        else badfrac >= 0.5
    peaks = np.isfinite(snr_map) & (snr_map >= threshold) & (snr_map == local_max) & ~halo
    lo, hi = edge_margin_px, snr_map.shape[0] - 1 - edge_margin_px
    dets = []
    for py, px in zip(*np.nonzero(peaks)):
        if not (lo <= py <= hi and lo <= px <= hi):
            continue
        cx, cy = _centroid(snr_map, int(py), int(px))
        dets.append(Detection(cx, cy, float(snr_map[py, px])))
    return sorted(dets, key=lambda d: d.snr, reverse=True)


def detect_patch(
    patch_dir: Path, target: dict, thresholds: Mapping[str, float]
) -> tuple[list[Detection], list[str], list[Frame]]:
    frames = load_frames(patch_dir, target)
    labels = [f"{f.band}/{f.visit}" for f in frames]
    dets = find_sources(
        detection_map(frames, int(thresholds["min_frames"])),
        bad_fraction(frames),
        threshold=thresholds["detect_snr"],
        min_sep_px=thresholds["min_sep_px"],
        edge_margin_px=int(thresholds["edge_margin_px"]),
        halo_dilate_px=int(thresholds["halo_dilate_px"]),
    )
    return dets, labels, frames


def visit_centroid(
    frames: Sequence[Frame], visit: str, x0: float, y0: float, *, search_px: float = 2.0
) -> Detection | None:
    sel = [f for f in frames if f.visit == visit]
    if not sel:
        return None
    s = detection_map(sel, 1)
    yy, xx = np.mgrid[0:s.shape[0], 0:s.shape[1]]
    ok = np.isfinite(s) & (np.hypot(xx - x0, yy - y0) <= search_px)
    if not ok.any():
        return None
    py, px = np.unravel_index(np.argmax(np.where(ok, s, -np.inf)), s.shape)
    cx, cy = _centroid(s, int(py), int(px))
    return Detection(cx, cy, float(s[py, px]))
