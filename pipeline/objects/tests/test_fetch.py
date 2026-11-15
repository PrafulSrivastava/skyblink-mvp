import json
import re
from pathlib import Path

import pytest
import requests

from config import CATALOGS, ZERO_ROWS_ALLOWED
from fetch_catalogs import FetchError, build_query, fetch_all, parse_gator_ipac

FIXTURE = Path(__file__).parent / "fixtures" / "gator_catwise_small.tbl"


class _Resp:
    status_code = 200

    def __init__(self, text):
        self.text = text


class FailingSession:
    """First `fail_after` GETs return the fixture, then raise ConnectionError."""

    def __init__(self, fail_after):
        self.fail_after, self.calls = fail_after, 0

    def get(self, url, params=None, timeout=None, **kw):
        self.calls += 1
        if self.calls > self.fail_after:
            raise requests.ConnectionError("simulated network failure")
        return _Resp(FIXTURE.read_text())


def test_parse_fixture_rows_and_units():
    rows, units = parse_gator_ipac(FIXTURE.read_text(), CATALOGS["catwise"].columns)
    assert len(rows) == int(re.search(r"RowsRetrieved\s*=\s*(\d+)", FIXTURE.read_text()).group(1))
    assert units["pmra"] == "arcsec/yr" and units["ra_pm"] == "deg"
    assert all(set(CATALOGS["catwise"].columns) <= set(r) for r in rows)


def test_error_body_raises():
    with pytest.raises(FetchError):
        parse_gator_ipac('[struct stat="ERROR", msg="904: invalid identifier"]', ["ra"])


def test_html_502_body_raises():
    with pytest.raises(FetchError):
        parse_gator_ipac("<!DOCTYPE HTML><title>502 Proxy Error</title>", ["ra"])


def test_missing_column_raises():
    with pytest.raises(FetchError):
        parse_gator_ipac(FIXTURE.read_text(), ["ra", "no_such_col"])


def test_network_failure_writes_nothing(tmp_path, monkeypatch):
    out = tmp_path / "catalogs"; out.mkdir(); (out / "keep.txt").write_text("x")
    session = FailingSession(fail_after=7)
    monkeypatch.setattr("time.sleep", lambda s: None)
    with pytest.raises(FetchError):
        fetch_all(out_dir=out, session=session)
    assert sorted(p.name for p in out.iterdir()) == ["keep.txt"]
    assert not (tmp_path / ".catalogs_tmp").exists()


def test_query_params():
    q = build_query("catwise_2020", 269.4463742, 4.7686831, 300.0, ["ra", "dec"])
    assert q["spatial"] == "cone" and q["radunits"] == "arcsec" and q["outfmt"] == "1"
    assert q["objstr"] == "269.4463742 4.7686831" and q["selcols"] == "ra,dec" and q["radius"] == "300.0"


def test_units_returned_verbatim_not_astropy_normalised():
    bs = chr(92)
    text = (bs + "fixlen = T\n" + bs + "RowsRetrieved =                    1\n"
            "|      ra      |    pmra    |\n"
            "|    double    |   double   |\n"
            "|     deg      |  arcsec/yr |\n"
            "|    null      |    null    |\n"
            "  269.1          0.5\n")
    _, units = parse_gator_ipac(text, ["ra", "pmra"])
    assert units == {"ra": "deg", "pmra": "arcsec/yr"}


def _ipac(columns, nrows):
    bs = chr(92)
    w = 14
    cell = lambda s: " " + s.ljust(w - 1)
    units = {"pmra": "arcsec/yr", "ra": "deg"}
    lines = [bs + "fixlen = T", bs + f"RowsRetrieved = {nrows}",
             "|" + "|".join(cell(c) for c in columns) + "|",
             "|" + "|".join(cell("char") for _ in columns) + "|",
             "|" + "|".join(cell(units.get(c, "")) for c in columns) + "|",
             "|" + "|".join(cell("null") for _ in columns) + "|"]
    lines += ["".join(cell("x") for _ in columns) + " " for _ in range(nrows)]
    return "\n".join(lines) + "\n"


class SyntheticSession:
    """Serves well-formed IPAC tables; zero rows for the tables in `empty`."""

    def __init__(self, empty=()):
        self.empty = set(empty)

    def get(self, url, params=None, timeout=None, **kw):
        n = 0 if params["catalog"] in self.empty else 3
        return _Resp(_ipac(params["selcols"].split(","), n))


@pytest.fixture
def one_patch(monkeypatch):
    monkeypatch.setattr("time.sleep", lambda s: None)
    monkeypatch.setattr("fetch_catalogs._patch_centre", lambda patch: (10.0, 20.0))


def test_zero_rows_allowed_for_allowlisted_pair(tmp_path, one_patch):
    out = tmp_path / "catalogs"
    snap = fetch_all(patches=("r-dra",), out_dir=out,
                     session=SyntheticSession(empty={"catwise_2020"}), today="2026-11-15")
    lines = (out / "r-dra_catwise.csv").read_text().splitlines()
    assert lines == [",".join(CATALOGS["catwise"].columns)]
    entry = next(f for f in snap["files"] if f["file"] == "r-dra_catwise.csv")
    assert entry["rows"] == 0 and entry["note"] == ZERO_ROWS_ALLOWED[("r-dra", "catwise")]
    others = [f for f in snap["files"] if f is not entry]
    assert len(others) == 2 and all(f["rows"] == 3 and "note" not in f for f in others)
    assert json.loads((out / "snapshots.json").read_text())["files"][0]["note"]


def test_zero_rows_elsewhere_raises_and_writes_nothing(tmp_path, one_patch):
    out = tmp_path / "catalogs"; out.mkdir()
    with pytest.raises(FetchError, match="zero rows"):
        fetch_all(patches=("barnards-star",), out_dir=out,
                  session=SyntheticSession(empty={"catwise_2020"}))
    assert list(out.iterdir()) == []
    assert not (tmp_path / ".catalogs_tmp").exists()
