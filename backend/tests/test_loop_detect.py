"""Tests for loop detection service."""

import json

import numpy as np
import pytest
import soundfile as sf

from app.services.loop_detect import detect_loop, _snap_to_nearest


@pytest.fixture
def looping_track(tmp_path, monkeypatch):
    """Create a synthetic track with a clear repeated section."""
    upload_dir = tmp_path / "uploads"
    meta_dir = upload_dir / ".meta"
    meta_dir.mkdir(parents=True)
    monkeypatch.setattr("app.services.loop_detect.UPLOAD_DIR", upload_dir)

    sr = 22050
    t = np.linspace(0, 4, 4 * sr, endpoint=False)
    tone_a = 0.5 * np.sin(2 * np.pi * 440 * t)
    tone_b = 0.5 * np.sin(2 * np.pi * 554 * t)
    audio = np.concatenate([tone_a, tone_b, tone_a, tone_b])

    track_id = "loop_test"
    audio_path = upload_dir / f"{track_id}.wav"
    sf.write(str(audio_path), audio, sr)

    meta = {
        "id": track_id,
        "filename": "loop_test.wav",
        "file_path": f"{track_id}.wav",
        "bpm": 120,
        "key": "Am",
        "duration": len(audio) / sr,
    }
    (meta_dir / f"{track_id}.json").write_text(json.dumps(meta))
    return track_id


@pytest.fixture
def short_track(tmp_path, monkeypatch):
    """Create a very short track that shouldn't loop."""
    upload_dir = tmp_path / "uploads"
    meta_dir = upload_dir / ".meta"
    meta_dir.mkdir(parents=True)
    monkeypatch.setattr("app.services.loop_detect.UPLOAD_DIR", upload_dir)

    sr = 22050
    audio = 0.5 * np.sin(2 * np.pi * 440 * np.linspace(0, 2, 2 * sr))

    track_id = "short_test"
    sf.write(str(upload_dir / f"{track_id}.wav"), audio, sr)

    meta = {
        "id": track_id,
        "filename": "short.wav",
        "file_path": f"{track_id}.wav",
        "bpm": 120,
        "key": "C",
        "duration": 2.0,
    }
    (meta_dir / f"{track_id}.json").write_text(json.dumps(meta))
    return track_id


def test_detect_loop_finds_repeat(looping_track):
    result = detect_loop(looping_track)
    assert result["found"] is True
    assert result["score"] >= 0.5
    assert result["end_s"] > result["start_s"]
    assert result["crossfade_s"] > 0


def test_detect_loop_short_track(short_track):
    result = detect_loop(short_track)
    assert result["found"] is False


def test_detect_loop_missing_track(tmp_path, monkeypatch):
    upload_dir = tmp_path / "uploads"
    meta_dir = upload_dir / ".meta"
    meta_dir.mkdir(parents=True)
    monkeypatch.setattr("app.services.loop_detect.UPLOAD_DIR", upload_dir)
    with pytest.raises(ValueError, match="not found"):
        detect_loop("nonexistent")


def test_detect_loop_updates_metadata(looping_track, tmp_path, monkeypatch):
    upload_dir = tmp_path / "uploads"
    detect_loop(looping_track)
    meta = json.loads((upload_dir / ".meta" / f"{looping_track}.json").read_text())
    assert "loop" in meta


def test_snap_to_nearest():
    beats = np.array([0.5, 1.0, 1.5, 2.0])
    assert _snap_to_nearest(0.6, beats) == 0.5
    assert _snap_to_nearest(1.8, beats) == 2.0
    assert _snap_to_nearest(1.25, beats) == 1.5
