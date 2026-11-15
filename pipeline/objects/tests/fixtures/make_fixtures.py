"""Deterministic generator for the mini cross-match fixture.

Run `python make_fixtures.py` (from anywhere) to rewrite mini_target.json, mini_catwise.csv,
mini_allwise.csv and mini_2mass.csv next to this file. Both script and outputs are committed;
test_match.py checks that they agree.

Sources are placed by their png position at the mean epoch (MJD 61000) and then moved back to
each catalogue's epoch with `geometry.propagate`.
"""
from __future__ import annotations

import csv
import io
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from geometry import png_to_radec, propagate, radec_to_png  # noqa: E402

MEAN_MJD = 61000.0
CATWISE_MJD = 57170.0
ARCSEC_PER_YR_TO_MAS = 1000.0

GRID = {
    "NAXIS1": 49, "NAXIS2": 49,
    "CTYPE1": "RA---TAN", "CTYPE2": "DEC--TAN",
    "CRVAL1": 150.0, "CRVAL2": 2.0,
    "CDELT1": -6.15 / 3600, "CDELT2": 6.15 / 3600,
    "CRPIX1": 25.0, "CRPIX2": 25.0,
    "CUNIT1": "deg", "CUNIT2": "deg", "RADESYS": "ICRS",
    "pixel_scale_arcsec": 6.15,
}
VISITS = [("v1", 60800.0), ("v2", 61200.0)]
TARGET_PM = (3000.0, 0.0)  # mas/yr
GAIA_EPOCH_MJD = 57388.5

CATWISE_COLS = ["source_name", "ra", "dec", "ra_pm", "dec_pm", "pmra", "pmdec", "sigpmra", "sigpmdec",
                "w1mpro", "w2mpro", "w1snr", "w2snr", "nb", "na", "cc_flags", "ab_flags", "pmcode",
                "meanobsmjd"]
ALLWISE_COLS = ["designation", "ra", "dec", "w1mpro", "w2mpro", "w3mpro", "w1snr", "w2snr", "cc_flags",
                "ext_flg", "ph_qual", "w1mjdmean"]
TMASS_COLS = ["designation", "ra", "dec", "j_m", "h_m", "k_m", "ph_qual", "cc_flg", "jdate"]


def _sky(x: float, y: float) -> tuple[float, float]:
    return png_to_radec(GRID, x, y)


def _pm_between(pos_from, pos_to, from_mjd: float, to_mjd: float) -> tuple[float, float]:
    """The linear proper motion (mas/yr, pmra incl. cos dec) that carries pos_from to pos_to."""
    dt = (to_mjd - from_mjd) / 365.25
    pmdec = (pos_to[1] - pos_from[1]) * 3.6e6 / dt
    pmra = (pos_to[0] - pos_from[0]) * 3.6e6 * math.cos(math.radians(pos_to[1])) / dt
    return pmra, pmdec


def _target_catalog_position() -> tuple[float, float]:
    return propagate(*_sky(24.0, 24.0), *TARGET_PM, MEAN_MJD, GAIA_EPOCH_MJD)


def _target_json() -> dict:
    cra, cdec = _target_catalog_position()
    visits = []
    for vid, mjd in VISITS:
        ra, dec = propagate(cra, cdec, *TARGET_PM, GAIA_EPOCH_MJD, mjd)
        x, y = radec_to_png(GRID, ra, dec)
        visits.append({
            "id": vid, "mjd_mean": mjd, "full": True,
            "target_radec": [round(ra, 7), round(dec, 7)],
            "target_px": {"x": round(x, 3), "y": round(48 - y, 3), "png_x": round(x, 3), "png_y": round(y, 3)},
        })
    cra8, cdec8 = _sky(8.0, 40.0)
    return {
        "id": "mini", "name": "Mini Target",
        "catalog": {
            "catalog": "Gaia DR3", "source_id": "1000000000000000001",
            "ra": cra, "dec": cdec, "pmra": TARGET_PM[0], "pmdec": TARGET_PM[1],
            "pmra_err": 0.5, "pmdec_err": 0.5, "G": 9.5, "ref_epoch": "J2016.0 (TCB)",
            "ref_epoch_mjd": GAIA_EPOCH_MJD,
        },
        "mean_epoch": {"mjd": MEAN_MJD, "ra_deg": GRID["CRVAL1"], "dec_deg": GRID["CRVAL2"]},
        "grid": GRID,
        "visits": visits,
        "full_visits": [v for v, _ in VISITS],
        "comparison_star": {
            "gaia_dr3_source_id": "1000000000000000002", "ra": cra8, "dec": cdec8, "G": 12.0,
            "pm_total_mas_yr": 2.0, "x": 8.0, "y": 8.0, "png_x": 8.0, "png_y": 40.0,
        },
    }


def _catwise_row(name, ra, dec, pm=(0.0, 0.0), sig=0.01, w1=12.0, w2=None, cc="0000"):
    """ra/dec = position at the mean epoch; pm in mas/yr; CSV pm/sig in arcsec/yr."""
    ra_pm, dec_pm = propagate(ra, dec, *pm, MEAN_MJD, CATWISE_MJD)
    return {
        "source_name": name, "ra": ra_pm, "dec": dec_pm, "ra_pm": ra_pm, "dec_pm": dec_pm,
        "pmra": pm[0] / 1000, "pmdec": pm[1] / 1000, "sigpmra": sig, "sigpmdec": sig,
        "w1mpro": w1, "w2mpro": w1 - 0.1 if w2 is None else w2, "w1snr": 30.0, "w2snr": 20.0,
        "nb": 1, "na": 0, "cc_flags": cc, "ab_flags": "00", "pmcode": "1N000", "meanobsmjd": 57170.0,
    }


def _catwise_rows() -> list[dict]:
    rows = [
        _catwise_row("C1", *_sky(10.0, 10.0), w1=12.0, w2=11.9),
        _catwise_row("C2", *_sky(30.0, 15.0), pm=(0.0, 2000.0), sig=0.035, w1=13.5, w2=13.0),
        _catwise_row("C3", *_sky(37.0, 30.0), w1=14.0),
        _catwise_row("B1", *_sky(15.5, 30.0), w1=15.0),
        _catwise_row("B2", *_sky(14.3, 30.4), w1=11.0),
        _catwise_row("CQ", *_sky(5.0, 25.0), w1=13.0, cc="D000"),  # artifact flag: the loader drops it
    ]
    # Target split rows: 8" (north) and 15" (south) from the target's MJD 57170 position, with junk
    # proper motion. S1 is brighter than C2 and ends up on C2's detection at the mean epoch, so it
    # would steal that match if it were not absorbed into the target.
    cra, cdec = _target_catalog_position()
    tra, tdec = propagate(cra, cdec, *TARGET_PM, GAIA_EPOCH_MJD, CATWISE_MJD)
    s1 = (tra, tdec + 8.0 / 3600)
    s2 = (tra, tdec - 15.0 / 3600)
    pm1 = _pm_between(s1, _sky(30.3, 15.2), CATWISE_MJD, MEAN_MJD)
    rows.append({**_catwise_row("S1", *_sky(30.3, 15.2), pm=pm1, sig=0.1, w1=10.0),
                 "ra": s1[0], "dec": s1[1], "ra_pm": s1[0], "dec_pm": s1[1]})
    pm2 = (-400.0, 250.0)
    rows.append({**_catwise_row("S2", *propagate(*s2, *pm2, CATWISE_MJD, MEAN_MJD), pm=pm2, sig=0.1, w1=11.5),
                 "ra": s2[0], "dec": s2[1], "ra_pm": s2[0], "dec_pm": s2[1]})
    return rows


def _allwise_row(name, ra, dec, epoch, w1=14.0):
    return {"designation": name, "ra": ra, "dec": dec, "w1mpro": w1, "w2mpro": w1 - 0.1, "w3mpro": 12.0,
            "w1snr": 20.0, "w2snr": 15.0, "cc_flags": "0000", "ext_flg": 0, "ph_qual": "AAAU",
            "w1mjdmean": epoch}


def _tmass_row(name, ra, dec, mjd, j=14.0, h=13.5, k=13.0):
    return {"designation": name, "ra": ra, "dec": dec, "j_m": j, "h_m": h, "k_m": k, "ph_qual": "AAA",
            "cc_flg": "000", "jdate": mjd + 2400000.5}


def _fmt(v):
    return repr(round(float(v), 9)) if isinstance(v, float) else str(v)


def _csv(cols: list[str], rows: list[dict]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(cols)
    for r in rows:
        w.writerow([_fmt(r[c]) for c in cols])
    return buf.getvalue()


def write_all(out_dir: Path) -> None:
    out_dir = Path(out_dir)
    catwise = _catwise_rows()
    c2 = next(r for r in catwise if r["source_name"] == "C2")
    c2_pm = (c2["pmra"] * 1000, c2["pmdec"] * 1000)
    c2_allwise = propagate(c2["ra_pm"], c2["dec_pm"], *c2_pm, CATWISE_MJD, 55400.0)
    c2_tmass = propagate(c2["ra_pm"], c2["dec_pm"], *c2_pm, CATWISE_MJD, 51400.0)
    allwise = [
        _allwise_row("C2_AllWISE", *c2_allwise, 55400.0, w1=13.6),
        _allwise_row("A1", *_sky(40.0, 40.0), 55355.5, w1=14.2),
    ]
    tmass = [
        _tmass_row("C2_2MASS", *c2_tmass, 51400.0, j=14.5, h=14.0, k=13.8),
        _tmass_row("T1", *_sky(20.0, 40.0), 51692.4285),
    ]
    texts = {
        "mini_target.json": json.dumps(_target_json(), indent=1) + "\n",
        "mini_catwise.csv": _csv(CATWISE_COLS, catwise),
        "mini_allwise.csv": _csv(ALLWISE_COLS, allwise),
        "mini_2mass.csv": _csv(TMASS_COLS, tmass),
    }
    for name, text in texts.items():
        (out_dir / name).write_bytes(text.encode("utf-8"))


if __name__ == "__main__":
    write_all(Path(__file__).resolve().parent)
