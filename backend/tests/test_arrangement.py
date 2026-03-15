"""Tests for the auto-arrangement service."""

import json
from pathlib import Path

import pytest

from app.services.arrangement import (
    auto_arrange,
    compute_score,
    key_compatibility,
    energy_compatibility,
    bpm_compatibility,
    compute_crossfade_duration,
)


def test_key_compat_identical():
    assert key_compatibility("Am", "Am") == 1.0

def test_key_compat_relative():
    assert key_compatibility("Am", "C") == 0.6

def test_key_compat_adjacent():
    assert key_compatibility("Am", "Dm") == 0.8

def test_key_compat_distant():
    assert key_compatibility("Am", "F#m") == 0.0

def test_key_compat_unknown():
    assert key_compatibility("Am", "Xm") == 0.0

def test_energy_same():
    assert energy_compatibility(0.5, 0.5) == 1.0

def test_energy_opposite():
    assert energy_compatibility(0.0, 1.0) == 0.0

def test_energy_close():
    assert energy_compatibility(0.4, 0.5) == pytest.approx(0.9)

def test_bpm_same():
    assert bpm_compatibility(120, 120) == 1.0

def test_bpm_close():
    assert bpm_compatibility(120, 125) >= 0.9

def test_bpm_far():
    assert bpm_compatibility(60, 120) < 0.6

def test_bpm_zero():
    assert bpm_compatibility(0, 120) == 0.0

def test_compute_score_identical_tracks():
    t = {"energy": 0.5, "key": "Am", "bpm": 120}
    assert compute_score(t, t) == pytest.approx(1.0)

def test_crossfade_same_bpm():
    dur = compute_crossfade_duration(120, 120)
    assert 3.0 <= dur <= 5.0

def test_crossfade_different_bpm():
    dur = compute_crossfade_duration(60, 120)
    assert dur > 8.0


@pytest.fixture
def three_tracks(tmp_path, monkeypatch):
    upload_dir = tmp_path / "uploads"
    meta_dir = upload_dir / ".meta"
    arr_dir = tmp_path / "arrangements"
    meta_dir.mkdir(parents=True)
    arr_dir.mkdir()

    monkeypatch.setattr("app.services.arrangement.UPLOAD_DIR", upload_dir)
    monkeypatch.setattr("app.services.arrangement.ARRANGEMENTS_DIR", arr_dir)

    tracks = [
        {"id": "t1", "filename": "a.mp3", "file_path": "t1.mp3", "bpm": 80, "key": "Am", "energy": 0.2, "duration": 180},
        {"id": "t2", "filename": "b.mp3", "file_path": "t2.mp3", "bpm": 120, "key": "C", "energy": 0.8, "duration": 200},
        {"id": "t3", "filename": "c.mp3", "file_path": "t3.mp3", "bpm": 100, "key": "Dm", "energy": 0.5, "duration": 150},
    ]
    for t in tracks:
        (meta_dir / f"{t['id']}.json").write_text(json.dumps(t))

    return {"tracks": tracks, "arr_dir": arr_dir}


def test_auto_arrange_orders_by_energy(three_tracks):
    result = auto_arrange(["t1", "t2", "t3"])
    assert result["tracks"][0] == "t1"
    assert len(result["crossfades"]) == 2

def test_auto_arrange_single_track(three_tracks):
    result = auto_arrange(["t1"])
    assert result["tracks"] == ["t1"]
    assert result["crossfades"] == []

def test_auto_arrange_missing_track(three_tracks):
    with pytest.raises(ValueError, match="not found"):
        auto_arrange(["nonexistent"])

def test_auto_arrange_saves_json(three_tracks):
    result = auto_arrange(["t1", "t2", "t3"])
    arr_path = three_tracks["arr_dir"] / f"{result['id']}.json"
    assert arr_path.exists()
    loaded = json.loads(arr_path.read_text())
    assert loaded["tracks"] == result["tracks"]

def test_auto_arrange_crossfade_bounds(three_tracks):
    result = auto_arrange(["t1", "t2", "t3"])
    for xf in result["crossfades"]:
        assert 3.0 <= xf["duration_s"] <= 15.0
        assert xf["type"] == "equal_power"
