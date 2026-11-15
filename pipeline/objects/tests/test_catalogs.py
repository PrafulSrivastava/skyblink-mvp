import pytest

from catalogs import load_allwise, load_catwise, load_tmass
from config import CATALOGS

RA_PM_A = 269.4400001


def _write(path, columns, rows):
    lines = [",".join(columns)]
    for r in rows:
        lines.append(",".join(str(r.get(c, "")) for c in columns))
    path.write_text("\n".join(lines) + "\n")


def test_catwise_units_and_filter(tmp_path):
    base = dict(ra=1.0, dec=2.0, ra_pm=RA_PM_A, dec_pm=4.7, pmra=0.0, pmdec=0.0,
                sigpmra=0.003, sigpmdec=0.004, w1mpro=14.0, w2mpro=13.0,
                w1snr=20, w2snr=15, cc_flags="0000", ab_flags="00", pmcode="")
    rows = [
        {**base, "source_name": "A", "pmra": 0.89940, "pmdec": -0.1},
        {**base, "source_name": "B", "cc_flags": "D000"},
        {**base, "source_name": "C", "w1snr": 3, "w2snr": 2},
        {**base, "source_name": "D", "cc_flags": "hh00"},
    ]
    path = tmp_path / "c.csv"
    _write(path, CATALOGS["catwise"].columns, rows)
    got = load_catwise(path)
    assert [r.name for r in got] == ["A", "D"]
    assert got[0].pmra == pytest.approx(899.4)
    assert got[0].pmdec == pytest.approx(-100.0)
    assert got[0].sigpm == pytest.approx(5.0)
    assert got[0].ra == pytest.approx(RA_PM_A) and got[0].ra != 1.0


def test_tmass_epoch_from_jdate(tmp_path):
    path = tmp_path / "t.csv"
    _write(path, CATALOGS["2mass"].columns, [
        dict(designation="X", ra=1, dec=2, j_m=10.5, h_m="", k_m=9.0, jdate=2451692.9285)])
    row = load_tmass(path)[0]
    assert row.epoch_mjd == pytest.approx(2451692.9285 - 2400000.5)
    assert row.h is None and row.j == 10.5


def test_allwise_epoch_default(tmp_path):
    path = tmp_path / "a.csv"
    _write(path, CATALOGS["allwise"].columns, [
        dict(designation="Y", ra=1, dec=2, w1mpro=12, cc_flags="0000", w1mjdmean="")])
    assert load_allwise(path)[0].epoch_mjd == 55400.0


def test_load_catwise_header_only_csv_is_empty(tmp_path):
    path = tmp_path / "empty.csv"
    _write(path, CATALOGS["catwise"].columns, [])
    assert load_catwise(path) == []
