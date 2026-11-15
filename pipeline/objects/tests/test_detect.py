import json
from math import hypot

import numpy as np
import pytest

from config import DATA_DIR, NPIX, THRESHOLDS
from detect import (
    Frame,
    bad_fraction,
    detect_patch,
    detection_map,
    find_sources,
    load_frames,
    visit_centroid,
)

YY, XX = np.mgrid[0:NPIX, 0:NPIX]


def box(x0, x1, y0, y1):
    m = np.zeros((NPIX, NPIX), bool)
    m[y0:y1 + 1, x0:x1 + 1] = True
    return m


def _psf(x, y, amp):
    return amp * np.exp(-((XX - x) ** 2 + (YY - y) ** 2) / (2 * 0.6 ** 2))


def make_frames(sources, n=12, seed=42, mask=None, visit="v1", band="D1"):
    rng = np.random.default_rng(seed)
    clean = sum((_psf(x, y, a) for x, y, a in sources), np.zeros((NPIX, NPIX)))
    frames = []
    for _ in range(n):
        d = (clean + rng.normal(0.0, 1.0, (NPIX, NPIX))).astype(np.float32)
        if mask is not None:
            d[mask] = np.nan
        frames.append(Frame(band, visit, d))
    return frames


def make_frames_two_visits(pos_v1, pos_v2, amp):
    return (
        make_frames([(*pos_v1, amp)], visit="v1", seed=1)
        + make_frames([(*pos_v2, amp)], visit="v2", seed=2)
    )


def run(frames):
    return find_sources(
        detection_map(frames, 3), bad_fraction(frames),
        threshold=5.0, min_sep_px=2.0, edge_margin_px=2, halo_dilate_px=1,
    )


def test_finds_isolated_sources():
    srcs = [(10.3, 12.7, 3.0), (30.0, 35.5, 3.0), (40.6, 8.2, 3.0)]
    dets = run(make_frames(srcs))
    assert len(dets) == 3
    for x, y, _ in srcs:
        assert min(hypot(d.png_x - x, d.png_y - y) for d in dets) < 0.25


def test_pure_noise_gives_nothing():
    assert run(make_frames([])) == []


def test_edge_source_excluded():
    assert run(make_frames([(1.0, 20.0, 5.0)])) == []


def test_masked_core_and_halo_suppressed():
    frames = make_frames([(24.0, 24.0, 50.0)], mask=box(23, 25, 23, 25))
    assert all(hypot(d.png_x - 24, d.png_y - 24) > 2.5 for d in run(frames))


def test_close_pair_merges():
    assert len(run(make_frames([(20.0, 20.0, 4.0), (21.0, 20.0, 4.0)]))) == 1


def test_visit_centroid_tracks_shift():
    fr = make_frames_two_visits(pos_v1=(20.0, 20.0), pos_v2=(21.5, 20.0), amp=4.0)
    assert visit_centroid(fr, "v2", 20.0, 20.0).png_x == pytest.approx(21.5, abs=0.25)


def test_visit_centroid_none_when_all_masked():
    fr = make_frames([(20.0, 20.0, 4.0)], mask=box(0, 48, 0, 48))
    assert visit_centroid(fr, "v1", 20.0, 20.0) is None


def test_load_frames_rejects_wrong_size(tmp_path):
    (tmp_path / "frames" / "D1").mkdir(parents=True)
    np.zeros(100, "<f4").tofile(tmp_path / "frames" / "D1" / "v1.f32")
    target = {"paths": {"D1": {"v1": {"f32": "frames/D1/v1.f32"}, "diff": "diff/x.png"}}}
    with pytest.raises(ValueError):
        load_frames(tmp_path, target)


def _barnard():
    pdir = DATA_DIR / "barnards-star"
    return pdir, json.loads((pdir / "target.json").read_text())


def test_real_frame_orientation():  # D2/v1: brightest pixel is the comparison star
    pdir, target = _barnard()
    a = next(f for f in load_frames(pdir, target) if (f.band, f.visit) == ("D2", "v1"))
    assert a.data.shape == (NPIX, NPIX)
    assert np.unravel_index(np.nanargmax(a.data), a.data.shape) == (8, 25)


def test_real_patch_finds_comparison_star():
    pdir, target = _barnard()
    dets, labels, _ = detect_patch(pdir, target, THRESHOLDS)
    assert min(hypot(d.png_x - 25.46, d.png_y - 7.839) for d in dets) < 1.0
    assert "D2/v1" in labels and 20 <= len(dets) <= 80
