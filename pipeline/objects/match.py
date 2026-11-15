"""CatWISE-first cross-match of detections, forced objects and motion flags.

Rules run in a fixed order and each detection / catalog row is claimed at most once:
1. absorb the bundle target's split CatWISE rows, 2. bundle target, 3. comparison star,
4. CatWISE (with AllWISE / 2MASS linked by back-propagation), 5. AllWISE then 2MASS direct,
6. everything left is unidentified (image-motion test), 7. statistics.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Mapping, Sequence

import numpy as np

from catalogs import AllwiseRow, CatwiseRow, TmassRow
from config import CATWISE_EPOCH_MJD, NPIX
from detect import Detection, Frame, visit_centroid
from geometry import MJD_PER_YEAR, png_to_radec, propagate, radec_to_png, sep_arcsec
from schema import CatalogMatch, PixelPos, ProperMotion, SkyObject

BRIGHT_W1 = 13.0
BRIGHT_EDGE_PX = 2.0
DEFAULT_SHIFT_FLOOR_PX = 0.5
MIN_FLOOR_SAMPLES = 3
CATWISE_SPAN_MJD = (55200.0, 58500.0)  # CatWISE2020 observing span, 2010-01 to 2018-12
TRACK_SAMPLES = 67
MIN_BASELINE_YR = 5.0  # older rows closer than this to the CatWISE epoch cannot contradict its motion


@dataclass
class MatchStats:
    median_sep_px: float | None
    n_catwise_in_grid: int
    chance_per_circle: float
    bright_recovery: float | None
    n_absorbed: int
    shift_floor_px: float
    comparison_offset_px: float | None
    target_detected: bool


def _target_track(target: dict) -> tuple[np.ndarray, np.ndarray]:
    """The target's sky positions over the CatWISE2020 observing span (linear proper motion)."""
    c = target["catalog"]
    mjds = np.linspace(CATWISE_SPAN_MJD[0], CATWISE_SPAN_MJD[1], TRACK_SAMPLES)
    return propagate(c["ra"], c["dec"], c["pmra"], c["pmdec"], c["ref_epoch_mjd"], mjds)


def absorb_target_rows(
    rows: list[CatwiseRow], target: dict, radius_arcsec: float
) -> tuple[list[CatwiseRow], list[CatwiseRow]]:
    """Split CatWISE rows of the bundle target -> (kept, absorbed).

    A fast mover is split into rows along its whole 2010-2018 track, so a row is absorbed when it lies within
    `radius_arcsec` of that track, not only of the position at the CatWISE mean epoch."""
    tra, tdec = _target_track(target)
    kept, absorbed = [], []
    for r in rows:
        near = float(np.min(sep_arcsec(tra, tdec, r.ra, r.dec))) <= radius_arcsec
        (absorbed if near else kept).append(r)
    return kept, absorbed


def catalog_moving(total: float, total_err: float | None, th: Mapping[str, float]) -> bool:
    """High catalog proper motion. A missing or non-positive error means unknown: no significance test."""
    if total < th["moving_pm_mas_yr"]:
        return False
    if total_err is None or total_err <= 0:
        return True
    return total >= th["moving_pm_min_significance"] * total_err


def link_older(
    cw: CatwiseRow, rows: Sequence[AllwiseRow | TmassRow], th: Mapping[str, float], used: set[int]
) -> tuple[int | None, float | None]:
    """Nearest unused older-catalog row to `cw` carried back to the row's epoch -> (index, sep arcsec)."""
    best: tuple[int, float] | None = None
    sigpm = cw.sigpm if cw.sigpm > 0 else 0.0  # 0 means unknown: no widening
    for i, row in enumerate(rows):
        if i in used:
            continue
        epoch = row.epoch_mjd if math.isfinite(row.epoch_mjd) else CATWISE_EPOCH_MJD
        dt_yr = (epoch - CATWISE_EPOCH_MJD) / MJD_PER_YEAR
        ra, dec = propagate(cw.ra, cw.dec, cw.pmra, cw.pmdec, CATWISE_EPOCH_MJD, epoch)
        sep = float(sep_arcsec(ra, dec, row.ra, row.dec))
        radius = min(th["link_radius_arcsec"] + 3 * sigpm * abs(dt_yr) / 1000.0, th["link_radius_max_arcsec"])
        if sep <= radius and (best is None or sep < best[1]):
            best = (i, sep)
    return best if best else (None, None)


def _long_baseline(epoch_mjd: float) -> bool:
    """True when an older row's epoch is known and at least MIN_BASELINE_YR from the CatWISE epoch."""
    return math.isfinite(epoch_mjd) and abs(epoch_mjd - CATWISE_EPOCH_MJD) / MJD_PER_YEAR >= MIN_BASELINE_YR


def contradicting_older(
    cw: CatwiseRow, det_ra: float, det_dec: float,
    allwise: Sequence[AllwiseRow], tmass: Sequence[TmassRow], th: Mapping[str, float],
    used_aw: set[int], used_tm: set[int],
) -> list[tuple[str, int, float]]:
    """Older rows that disprove the CatWISE motion -> [(catalog label, row index, sep arcsec to the detection)].

    A row counts when its epoch is at least MIN_BASELINE_YR from the CatWISE epoch, it lies within
    `match_radius_arcsec` of the detection's static mean-epoch position, and it is farther than
    `link_radius_max_arcsec` from where the CatWISE proper motion predicts it (the `link_older` back-propagation).
    Rows without an epoch and rows already used by an object are ignored. Per catalog, the row nearest the
    detection is returned."""
    out = []
    for label, rows, used in (("AllWISE", allwise, used_aw), ("2MASS", tmass, used_tm)):
        best: tuple[int, float] | None = None
        for i, row in enumerate(rows):
            if i in used or not _long_baseline(row.epoch_mjd):
                continue
            sep = float(sep_arcsec(det_ra, det_dec, row.ra, row.dec))
            if sep > th["match_radius_arcsec"]:
                continue
            ra, dec = propagate(cw.ra, cw.dec, cw.pmra, cw.pmdec, CATWISE_EPOCH_MJD, row.epoch_mjd)
            if float(sep_arcsec(ra, dec, row.ra, row.dec)) > th["link_radius_max_arcsec"] and (best is None or sep < best[1]):
                best = (i, sep)
        if best:
            out.append((label, best[0], best[1]))
    return out


def _mags(**kw: float | None) -> dict[str, float]:
    return {k: float(v) for k, v in kw.items() if v is not None}


def _brightness_key(r: CatwiseRow) -> tuple[bool, float]:
    mag = r.w1 if r.w1 is not None else r.w2
    return (mag is None, 0.0 if mag is None else mag)


def build_objects(
    patch: str,
    target: dict,
    detections: list[Detection],
    frames: list[Frame],
    catwise: list[CatwiseRow],
    allwise: list[AllwiseRow],
    tmass: list[TmassRow],
    th: Mapping[str, float],
) -> tuple[list[SkyObject], MatchStats]:
    grid, mean, visits = target["grid"], target["mean_epoch"], target["visits"]
    mjd0 = mean["mjd"]
    vids = [v["id"] for v in visits]
    r_px, forced_px = th["match_radius_px"], th["forced_radius_px"]
    cx, cy = (grid["NAXIS1"] - 1) / 2, (grid["NAXIS2"] - 1) / 2

    det_order = sorted(range(len(detections)), key=lambda i: -detections[i].snr)
    claimed: set[int] = set()
    used_cw: set[int] = set()
    used_aw: set[int] = set()
    used_tm: set[int] = set()
    objs: list[SkyObject] = []

    def claim_nearest(x: float, y: float, radius: float) -> int | None:
        best, best_d = None, radius
        for i in det_order:
            if i not in claimed:
                d = math.hypot(detections[i].png_x - x, detections[i].png_y - y)
                if d <= best_d:
                    best, best_d = i, d
        if best is not None:
            claimed.add(best)
        return best

    def const_positions(x: float, y: float) -> dict[str, PixelPos]:
        return {v: PixelPos(x, y) for v in vids}

    def det_radec(d: Detection) -> tuple[float, float]:
        return png_to_radec(grid, d.png_x, d.png_y)

    # 1. absorb the target's split rows
    kept, absorbed = absorb_target_rows(catwise, target, th["target_absorb_radius_arcsec"])
    if kept:
        cw_ra, cw_dec = propagate(
            np.array([r.ra for r in kept]), np.array([r.dec for r in kept]),
            np.array([r.pmra for r in kept]), np.array([r.pmdec for r in kept]), CATWISE_EPOCH_MJD, mjd0)
        cw_x, cw_y = radec_to_png(grid, cw_ra, cw_dec)
    else:
        cw_ra = cw_dec = cw_x = cw_y = np.zeros(0)
    matched_cw: set[int] = set()

    def cw_png_at(row: CatwiseRow, mjd: float) -> tuple[float, float]:
        ra, dec = propagate(row.ra, row.dec, row.pmra, row.pmdec, CATWISE_EPOCH_MJD, mjd)
        return radec_to_png(grid, ra, dec)

    def take_catwise(j: int, det_ra: float, det_dec: float) -> tuple[list[CatalogMatch], bool]:
        """CatWISE row j plus its linked AllWISE and 2MASS rows (marked used), and whether a linked older row
        with a baseline of at least MIN_BASELINE_YR corroborates the CatWISE motion."""
        row = kept[j]
        used_cw.add(j)
        matched_cw.add(j)
        out = [CatalogMatch("CatWISE2020", row.name, float(sep_arcsec(det_ra, det_dec, cw_ra[j], cw_dec[j])),
                            _mags(W1=row.w1, W2=row.w2))]
        corroborated = False
        i, sep = link_older(row, allwise, th, used_aw)
        if i is not None:
            used_aw.add(i)
            a = allwise[i]
            corroborated |= _long_baseline(a.epoch_mjd)
            out.append(CatalogMatch("AllWISE", a.name, sep, _mags(W1=a.w1, W2=a.w2, W3=a.w3)))
        i, sep = link_older(row, tmass, th, used_tm)
        if i is not None:
            used_tm.add(i)
            t = tmass[i]
            corroborated |= _long_baseline(t.epoch_mjd)
            out.append(CatalogMatch("2MASS", t.name, sep, _mags(J=t.j, H=t.h, K=t.k)))
        return out, corroborated

    # 2. bundle target
    cat = target["catalog"]
    ti = claim_nearest(cx, cy, forced_px)
    tdet = detections[ti] if ti is not None else None
    dx, dy = (tdet.png_x - cx, tdet.png_y - cy) if tdet else (0.0, 0.0)
    pmra, pmdec = cat["pmra"], cat["pmdec"]
    total = math.hypot(pmra, pmdec)
    total_err = math.hypot(cat.get("pmra_err") or 0.0, cat.get("pmdec_err") or 0.0) or None
    mags = _mags(G=cat.get("G")) if cat["catalog"] == "Gaia DR3" else _mags(W1=cat.get("W1"), W2=cat.get("W2"))
    ra, dec = det_radec(tdet) if tdet else (mean["ra_deg"], mean["dec_deg"])
    objs.append(SkyObject(
        id="", kind="known", moving=catalog_moving(total, total_err, th), motion_basis="catalog",
        reason="bundle target", name=target["name"],
        catalogs=[CatalogMatch(cat["catalog"], str(cat["source_id"]), None, mags)],
        pm_mas_yr=ProperMotion(pmra, pmdec, total, total_err),
        ra=ra, dec=dec, catalog_ra=mean["ra_deg"], catalog_dec=mean["dec_deg"],
        snr=tdet.snr if tdet else None, detected=tdet is not None, forced="bundle target",
        image_shift_px=None,
        positions={v["id"]: PixelPos(v["target_px"]["png_x"] + dx, v["target_px"]["png_y"] + dy) for v in visits},
    ))

    # 3. comparison star
    comp = target.get("comparison_star")
    comparison_offset: float | None = None
    if comp:
        px, py = comp["png_x"], comp["png_y"]
        cdet = detections[ci] if (ci := claim_nearest(px, py, forced_px)) is not None else None
        rx, ry = (cdet.png_x, cdet.png_y) if cdet else (px, py)
        if cdet:
            comparison_offset = math.hypot(rx - px, ry - py)
        ra, dec = det_radec(cdet) if cdet else (comp["ra"], comp["dec"])
        catalogs = [CatalogMatch("Gaia DR3", str(comp["gaia_dr3_source_id"]), None, _mags(G=comp.get("G")))]
        if kept:
            d = np.hypot(cw_x - rx, cw_y - ry)
            cands = [int(j) for j in np.nonzero(d <= r_px)[0] if int(j) not in used_cw]
            if cands:
                catalogs += take_catwise(min(cands, key=lambda j: d[j]), ra, dec)[0]
        total = float(comp["pm_total_mas_yr"])
        objs.append(SkyObject(
            id="", kind="known", moving=catalog_moving(total, None, th), motion_basis="catalog",
            reason="comparison star", name="Gaia DR3 " + str(comp["gaia_dr3_source_id"]), catalogs=catalogs,
            pm_mas_yr=ProperMotion(None, None, total, None), ra=ra, dec=dec,
            catalog_ra=comp["ra"], catalog_dec=comp["dec"], snr=cdet.snr if cdet else None,
            detected=cdet is not None, forced="comparison star", image_shift_px=None,
            positions=const_positions(rx, ry),
        ))

    # 4. CatWISE: brightest candidate inside the match circle, ties to the nearest
    step4: list[tuple[SkyObject, Detection]] = []
    seps_px: list[float] = []
    for i in det_order:
        if i in claimed or not kept:
            continue
        det = detections[i]
        d = np.hypot(cw_x - det.png_x, cw_y - det.png_y)
        cands = [int(j) for j in np.nonzero(d <= r_px)[0] if int(j) not in used_cw]
        if not cands:
            continue
        j = min(cands, key=lambda j: (*_brightness_key(kept[j]), d[j]))
        claimed.add(i)
        row = kept[j]
        det_ra, det_dec = det_radec(det)
        catalogs, corroborated = take_catwise(j, det_ra, det_dec)
        seps_px.append(float(d[j]))
        total = math.hypot(row.pmra, row.pmdec)
        err = row.sigpm if row.sigpm > 0 else None
        moving = catalog_moving(total, err, th)
        contra = (contradicting_older(row, det_ra, det_dec, allwise, tmass, th, used_aw, used_tm)
                  if moving and not corroborated else [])
        if contra:  # an older measurement sits at the static position: the CatWISE motion is not credible
            moving = False
            for label, k, sep in contra:
                if any(c.catalog == label for c in catalogs) or k in (used_aw if label == "AllWISE" else used_tm):
                    continue
                if label == "AllWISE":
                    used_aw.add(k)
                    a = allwise[k]
                    catalogs.append(CatalogMatch(label, a.name, sep, _mags(W1=a.w1, W2=a.w2, W3=a.w3)))
                else:
                    used_tm.add(k)
                    t = tmass[k]
                    catalogs.append(CatalogMatch(label, t.name, sep, _mags(J=t.j, H=t.h, K=t.k)))
            pos = const_positions(det.png_x, det.png_y)
        else:
            pos = {}
            for v in visits:
                vx, vy = cw_png_at(row, v["mjd_mean"])
                pos[v["id"]] = PixelPos(det.png_x + vx - cw_x[j], det.png_y + vy - cw_y[j])
        o = SkyObject(
            id="", kind="known", moving=moving, motion_basis="catalog" if not contra else "none",
            reason=f"CatWISE2020 match within {catalogs[0].sep_arcsec:.1f} arcsec", name="CWISE " + row.name,
            catalogs=catalogs, pm_mas_yr=None if contra else ProperMotion(row.pmra, row.pmdec, total, err),
            ra=det_ra, dec=det_dec, catalog_ra=float(cw_ra[j]), catalog_dec=float(cw_dec[j]),
            snr=det.snr, detected=True, forced=None, image_shift_px=None, positions=pos)
        objs.append(o)
        step4.append((o, det))

    # 5. AllWISE, then 2MASS, direct (no motion)
    for rows, used, label, prefix, fmt, tail in (
        (allwise, used_aw, "AllWISE", "WISEA ", lambda r: _mags(W1=r.w1, W2=r.w2, W3=r.w3), "(no CatWISE2020 row)"),
        (tmass, used_tm, "2MASS", "2MASS J", lambda r: _mags(J=r.j, H=r.h, K=r.k),
         "(no CatWISE2020 or AllWISE row)"),
    ):
        if not rows:
            continue
        r_ra, r_dec = np.array([r.ra for r in rows]), np.array([r.dec for r in rows])
        for i in det_order:
            if i in claimed:
                continue
            det = detections[i]
            det_ra, det_dec = det_radec(det)
            sep = sep_arcsec(det_ra, det_dec, r_ra, r_dec)
            cands = [int(k) for k in np.nonzero(sep <= th["match_radius_arcsec"])[0] if int(k) not in used]
            if not cands:
                continue
            k = min(cands, key=lambda k: sep[k])
            claimed.add(i)
            used.add(k)
            row = rows[k]
            objs.append(SkyObject(
                id="", kind="known", moving=False, motion_basis="none",
                reason=f"{label} match within {sep[k]:.1f} arcsec {tail}", name=prefix + row.name,
                catalogs=[CatalogMatch(label, row.name, float(sep[k]), fmt(row))], pm_mas_yr=None,
                ra=det_ra, dec=det_dec, catalog_ra=row.ra, catalog_dec=row.dec, snr=det.snr,
                detected=True, forced=None, image_shift_px=None, positions=const_positions(det.png_x, det.png_y)))

    # 6. unidentified, with the image motion test between the first and last full visit
    full = target.get("full_visits") or [v["id"] for v in visits if v.get("full")]
    mjd_of = {v["id"]: v["mjd_mean"] for v in visits}
    can_measure = bool(frames) and len(full) >= 2 and full[0] != full[-1]
    min_snr = th["image_shift_min_snr"]

    def measure(x: float, y: float):
        """(shift px, centroid in first full visit, centroid in last) when both are reliable, else None."""
        if not can_measure:
            return None
        a, b = visit_centroid(frames, full[0], x, y), visit_centroid(frames, full[-1], x, y)
        if a is None or b is None or a.snr < min_snr or b.snr < min_snr:
            return None
        return math.hypot(b.png_x - a.png_x, b.png_y - a.png_y), a, b

    samples = []
    for o, det in step4:
        if not o.moving and det.snr >= min_snr and (m := measure(det.png_x, det.png_y)) is not None:
            samples.append(m[0])
    floor = float(np.median(samples)) if len(samples) >= MIN_FLOOR_SAMPLES else DEFAULT_SHIFT_FLOOR_PX
    shift_min = max(th["image_shift_min_px"], 3 * floor)

    for i in det_order:
        if i in claimed:
            continue
        det = detections[i]
        det_ra, det_dec = det_radec(det)
        m = measure(det.png_x, det.png_y)
        moving = m is not None and m[0] >= shift_min
        if moving:
            _, a, b = m
            t1, t2 = mjd_of[full[0]], mjd_of[full[-1]]
            pos = {}
            for v in visits:
                f = (v["mjd_mean"] - t1) / (t2 - t1)
                pos[v["id"]] = PixelPos(a.png_x + (b.png_x - a.png_x) * f, a.png_y + (b.png_y - a.png_y) * f)
        else:
            pos = const_positions(det.png_x, det.png_y)
        objs.append(SkyObject(
            id="", kind="unidentified", moving=moving, motion_basis="image" if moving else "none",
            reason=f"no CatWISE/AllWISE/2MASS source within {th['match_radius_arcsec']:.1f} arcsec",
            name="", catalogs=[], pm_mas_yr=None, ra=det_ra, dec=det_dec, catalog_ra=None, catalog_dec=None,
            snr=det.snr, detected=True, forced=None, image_shift_px=m[0] if m else None, positions=pos))

    # output order: detected by snr descending, then undetected forced objects
    detected = sorted((o for o in objs if o.detected), key=lambda o: -o.snr)
    objs = detected + [o for o in objs if not o.detected]
    n_unid = 0
    for k, o in enumerate(objs, 1):
        o.id = f"{patch}-{k:03d}"
        if o.kind == "unidentified":
            n_unid += 1
            o.name = f"Unidentified #{n_unid:03d}"

    # 7. statistics
    lo, hi = -0.5, NPIX - 0.5
    in_grid = [j for j in range(len(kept)) if lo <= cw_x[j] <= hi and lo <= cw_y[j] <= hi]
    bright = [j for j in in_grid if kept[j].w1 is not None and kept[j].w1 < BRIGHT_W1
              and BRIGHT_EDGE_PX <= cw_x[j] <= NPIX - 1 - BRIGHT_EDGE_PX
              and BRIGHT_EDGE_PX <= cw_y[j] <= NPIX - 1 - BRIGHT_EDGE_PX]
    stats = MatchStats(
        median_sep_px=float(np.median(seps_px)) if seps_px else None,
        n_catwise_in_grid=len(in_grid),
        chance_per_circle=len(in_grid) / NPIX ** 2 * math.pi * r_px ** 2,
        bright_recovery=sum(j in matched_cw for j in bright) / len(bright) if bright else None,
        n_absorbed=len(absorbed),
        shift_floor_px=floor,
        comparison_offset_px=comparison_offset,
        target_detected=tdet is not None,
    )
    return objs, stats
