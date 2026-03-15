# Phase 3: Timeline & Arrangement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-arrangement, loop detection, mix rendering, and timeline visualization with light user controls.

**Architecture:** Three new backend services (arrangement, loop_detect, mixer) + Celery task for rendering + new API routes + frontend timeline view with arrangement store.

**Tech Stack:** librosa, soundfile, pyloudnorm, numpy (backend); Zustand, React (frontend); existing Celery+Redis infrastructure.

---

### Task 1: Config & Data Directory Setup

**Files:**
- Modify: `backend/app/config.py`

**Step 1: Add new directories to config**

```python
# Add after PIPELINE_DIR line:
ARRANGEMENTS_DIR = DATA_DIR / "arrangements"

# Add ARRANGEMENTS_DIR to the mkdir loop at bottom
```

**Step 2: Verify**

Run: `cd backend && PYTHONPATH="" .venv/bin/python -c "from app.config import ARRANGEMENTS_DIR; print(ARRANGEMENTS_DIR)"`

**Step 3: Commit**

```bash
git add backend/app/config.py
git commit -m "feat: add arrangements data directory to config"
```

---

### Task 2: Arrangement Service

**Files:**
- Create: `backend/app/services/arrangement.py`
- Create: `backend/tests/test_arrangement.py`

**Step 1: Write failing tests**

```python
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


# --- Key compatibility ---

def test_key_compat_identical():
    assert key_compatibility("Am", "Am") == 1.0

def test_key_compat_relative():
    # Am (8A) and C (8B) are relative major/minor
    assert key_compatibility("Am", "C") == 0.6

def test_key_compat_adjacent():
    # Am (8A) and Dm (7A) are adjacent on wheel
    assert key_compatibility("Am", "Dm") == 0.8

def test_key_compat_distant():
    # Am (8A) and F#m (11A) are 3 steps apart
    assert key_compatibility("Am", "F#m") == 0.0

def test_key_compat_unknown():
    assert key_compatibility("Am", "Xm") == 0.0


# --- Energy compatibility ---

def test_energy_same():
    assert energy_compatibility(0.5, 0.5) == 1.0

def test_energy_opposite():
    assert energy_compatibility(0.0, 1.0) == 0.0

def test_energy_close():
    assert energy_compatibility(0.4, 0.5) == pytest.approx(0.9)


# --- BPM compatibility ---

def test_bpm_same():
    assert bpm_compatibility(120, 120) == 1.0

def test_bpm_close():
    assert bpm_compatibility(120, 125) >= 0.9

def test_bpm_far():
    assert bpm_compatibility(60, 120) < 0.6

def test_bpm_zero():
    assert bpm_compatibility(0, 120) == 0.0


# --- Score ---

def test_compute_score_identical_tracks():
    t = {"energy": 0.5, "key": "Am", "bpm": 120}
    assert compute_score(t, t) == pytest.approx(1.0)


# --- Crossfade duration ---

def test_crossfade_same_bpm():
    dur = compute_crossfade_duration(120, 120)
    assert 3.0 <= dur <= 5.0

def test_crossfade_different_bpm():
    dur = compute_crossfade_duration(60, 120)
    assert dur > 8.0


# --- Auto arrange ---

@pytest.fixture
def three_tracks(tmp_path, monkeypatch):
    """Create three fake tracks with metadata."""
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
    # Should start from lowest energy (t1=0.2), then build
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
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && PYTHONPATH="" .venv/bin/python -m pytest tests/test_arrangement.py -v`
Expected: ImportError

**Step 3: Implement arrangement service**

```python
"""Auto-arrangement service using energy curve + key/BPM compatibility."""

import json
import uuid
from pathlib import Path

from app.config import UPLOAD_DIR, ARRANGEMENTS_DIR

# Camelot wheel: key name -> (number 1-12, letter A=minor B=major)
CAMELOT_MAP = {
    "G#m": (1, "A"), "Abm": (1, "A"), "B": (1, "B"),
    "D#m": (2, "A"), "Ebm": (2, "A"), "F#": (2, "B"), "Gb": (2, "B"),
    "A#m": (3, "A"), "Bbm": (3, "A"), "C#": (3, "B"), "Db": (3, "B"),
    "Fm": (4, "A"), "G#": (4, "B"), "Ab": (4, "B"),
    "Cm": (5, "A"), "D#": (5, "B"), "Eb": (5, "B"),
    "Gm": (6, "A"), "A#": (6, "B"), "Bb": (6, "B"),
    "Dm": (7, "A"), "F": (7, "B"),
    "Am": (8, "A"), "C": (8, "B"),
    "Em": (9, "A"), "G": (9, "B"),
    "Bm": (10, "A"), "D": (10, "B"),
    "F#m": (11, "A"), "A": (11, "B"),
    "C#m": (12, "A"), "E": (12, "B"),
}


def key_compatibility(key_a: str, key_b: str) -> float:
    """Score key compatibility using the Camelot wheel (0.0 to 1.0)."""
    ca = CAMELOT_MAP.get(key_a)
    cb = CAMELOT_MAP.get(key_b)
    if ca is None or cb is None:
        return 0.0
    num_a, let_a = ca
    num_b, let_b = cb
    dist = min(abs(num_a - num_b), 12 - abs(num_a - num_b))
    if dist == 0 and let_a == let_b:
        return 1.0
    if dist == 0 and let_a != let_b:
        return 0.6
    if dist == 1 and let_a == let_b:
        return 0.8
    if dist == 2 and let_a == let_b:
        return 0.3
    return 0.0


def energy_compatibility(energy_a: float, energy_b: float) -> float:
    """Score energy compatibility (penalize large jumps)."""
    return 1.0 - abs(energy_a - energy_b)


def bpm_compatibility(bpm_a: float, bpm_b: float) -> float:
    """Score BPM compatibility (penalize > 10% difference)."""
    if bpm_a == 0 or bpm_b == 0:
        return 0.0
    ratio = min(bpm_a, bpm_b) / max(bpm_a, bpm_b)
    if ratio >= 0.9:
        return 1.0
    return max(0.0, ratio)


def compute_score(track_a: dict, track_b: dict) -> float:
    """Compute overall compatibility score between two tracks."""
    e = energy_compatibility(track_a["energy"], track_b["energy"])
    k = key_compatibility(track_a["key"], track_b["key"])
    b = bpm_compatibility(track_a["bpm"], track_b["bpm"])
    return 0.6 * e + 0.3 * k + 0.1 * b


def compute_crossfade_duration(bpm_a: float, bpm_b: float) -> float:
    """Compute crossfade duration based on BPM similarity (3-15s)."""
    if bpm_a == 0 or bpm_b == 0:
        return 8.0
    ratio = min(bpm_a, bpm_b) / max(bpm_a, bpm_b)
    return 3.0 + (1.0 - ratio) * 12.0


def auto_arrange(track_ids: list[str]) -> dict:
    """Arrange tracks by energy arc + key/BPM compatibility.

    Uses greedy nearest-neighbor from lowest-energy track.
    """
    meta_dir = UPLOAD_DIR / ".meta"

    tracks_meta = []
    for tid in track_ids:
        meta_path = meta_dir / f"{tid}.json"
        if not meta_path.exists():
            raise ValueError(f"Track metadata not found: {tid}")
        tracks_meta.append(json.loads(meta_path.read_text()))

    if len(tracks_meta) == 0:
        raise ValueError("No tracks provided")

    if len(tracks_meta) == 1:
        return {
            "id": f"arr_{uuid.uuid4().hex[:12]}",
            "tracks": [tracks_meta[0]["id"]],
            "crossfades": [],
            "total_duration_s": tracks_meta[0].get("duration", 0),
        }

    # Greedy nearest-neighbor from lowest-energy track
    remaining = list(range(len(tracks_meta)))
    start_idx = min(remaining, key=lambda i: tracks_meta[i].get("energy", 0))
    ordered = [start_idx]
    remaining.remove(start_idx)

    while remaining:
        current = ordered[-1]
        best = max(
            remaining,
            key=lambda i: compute_score(tracks_meta[current], tracks_meta[i]),
        )
        ordered.append(best)
        remaining.remove(best)

    # Build crossfades
    crossfades = []
    total_duration = 0.0
    for i, idx in enumerate(ordered):
        meta = tracks_meta[idx]
        total_duration += meta.get("duration", 0)
        if i > 0:
            prev_meta = tracks_meta[ordered[i - 1]]
            dur = compute_crossfade_duration(
                prev_meta.get("bpm", 0), meta.get("bpm", 0)
            )
            dur = round(min(15.0, max(3.0, dur)), 1)
            crossfades.append({
                "from": prev_meta["id"],
                "to": meta["id"],
                "duration_s": dur,
                "type": "equal_power",
            })
            total_duration -= dur

    arrangement = {
        "id": f"arr_{uuid.uuid4().hex[:12]}",
        "tracks": [tracks_meta[i]["id"] for i in ordered],
        "crossfades": crossfades,
        "total_duration_s": round(total_duration, 1),
    }

    ARRANGEMENTS_DIR.mkdir(parents=True, exist_ok=True)
    arr_path = ARRANGEMENTS_DIR / f"{arrangement['id']}.json"
    arr_path.write_text(json.dumps(arrangement, indent=2))

    return arrangement
```

**Step 4: Run tests**

Run: `cd backend && PYTHONPATH="" .venv/bin/python -m pytest tests/test_arrangement.py -v`
Expected: All pass

**Step 5: Commit**

```bash
git add backend/app/services/arrangement.py backend/tests/test_arrangement.py
git commit -m "feat: add auto-arrangement service with Camelot wheel key compatibility"
```

---

### Task 3: Loop Detection Service

**Files:**
- Create: `backend/app/services/loop_detect.py`
- Create: `backend/tests/test_loop_detect.py`

**Step 1: Write failing tests**

```python
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
    # Create a repeating pattern: 4 seconds of tone A, 4 seconds of tone B, repeat
    t = np.linspace(0, 4, 4 * sr, endpoint=False)
    tone_a = 0.5 * np.sin(2 * np.pi * 440 * t)  # A4
    tone_b = 0.5 * np.sin(2 * np.pi * 554 * t)  # C#5
    # Pattern repeats: A B A B -> clear self-similarity
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
    """Create a very short track (< 4 bars) that shouldn't loop."""
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
    # Too short for a meaningful loop
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
    # monkeypatch already set by fixture
    detect_loop(looping_track)
    meta = json.loads((upload_dir / ".meta" / f"{looping_track}.json").read_text())
    assert "loop" in meta


def test_snap_to_nearest():
    beats = np.array([0.5, 1.0, 1.5, 2.0])
    assert _snap_to_nearest(0.6, beats) == 0.5
    assert _snap_to_nearest(1.8, beats) == 2.0
    assert _snap_to_nearest(1.25, beats) == 1.5
```

**Step 2: Run to verify failure**

Run: `cd backend && PYTHONPATH="" .venv/bin/python -m pytest tests/test_loop_detect.py -v`

**Step 3: Implement loop detection**

```python
"""Loop point detection using chroma self-similarity at beat resolution."""

import json

import librosa
import numpy as np
from pathlib import Path

from app.config import UPLOAD_DIR


def _snap_to_nearest(t: float, beat_times: np.ndarray) -> float:
    """Snap a time value to the nearest beat."""
    idx = int(np.argmin(np.abs(beat_times - t)))
    return float(beat_times[idx])


def detect_loop(track_id: str) -> dict:
    """Detect the best seamless loop point in a track.

    Uses chroma self-similarity at beat resolution to find repeated sections,
    then scores candidates by chroma match, energy match, and duration.
    """
    meta_dir = UPLOAD_DIR / ".meta"
    meta_path = meta_dir / f"{track_id}.json"
    if not meta_path.exists():
        raise ValueError(f"Track metadata not found: {track_id}")

    meta = json.loads(meta_path.read_text())
    audio_path = UPLOAD_DIR / meta["file_path"]

    y, sr = librosa.load(str(audio_path), sr=None, mono=True)
    duration = len(y) / sr

    # Beat tracking
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    n_beats = len(beat_times)

    not_found = {
        "found": False,
        "start_s": 0,
        "end_s": 0,
        "crossfade_s": 0,
        "score": 0,
    }

    # Need at least 16 beats (4 bars) for a meaningful loop
    if n_beats < 16:
        meta["loop"] = not_found
        meta_path.write_text(json.dumps(meta, indent=2))
        return not_found

    # Beat-synced chroma
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    beat_chroma = librosa.util.sync(chroma, beat_frames)
    norms = np.linalg.norm(beat_chroma, axis=0, keepdims=True) + 1e-8
    beat_chroma_norm = beat_chroma / norms

    # Beat-synced RMS
    rms = librosa.feature.rms(y=y)[0]
    beat_rms = librosa.util.sync(rms.reshape(1, -1), beat_frames)[0]
    rms_mean = float(np.mean(beat_rms)) + 1e-8

    min_loop_beats = 16
    comparison_window = 4
    step = max(1, min_loop_beats // 4)

    best = {"score": 0.0, "start_beat": 0, "end_beat": 0}

    for start in range(0, n_beats - min_loop_beats, step):
        for end in range(start + min_loop_beats, n_beats, step):
            w = min(comparison_window, end - start)
            if w < 2:
                continue

            # Chroma similarity at loop boundary
            start_region = beat_chroma_norm[:, start : start + w]
            end_region = beat_chroma_norm[:, end - w : end]
            chroma_sim = float(np.mean(np.sum(start_region * end_region, axis=0)))

            # Energy match at boundary
            start_rms = beat_rms[start : start + w]
            end_rms = beat_rms[end - w : end]
            energy_match = 1.0 - float(np.mean(np.abs(start_rms - end_rms))) / rms_mean
            energy_match = max(0.0, min(1.0, energy_match))

            # Duration preference (longer loops preferred)
            loop_s = beat_times[min(end, n_beats - 1)] - beat_times[start]
            dur_score = min(1.0, loop_s / duration) if duration > 0 else 0

            score = 0.5 * chroma_sim + 0.35 * energy_match + 0.15 * dur_score

            if score > best["score"]:
                best = {"score": score, "start_beat": start, "end_beat": end}

    if best["score"] < 0.4:
        meta["loop"] = not_found
        meta_path.write_text(json.dumps(meta, indent=2))
        return not_found

    start_s = float(beat_times[best["start_beat"]])
    end_beat = min(best["end_beat"], n_beats - 1)
    end_s = float(beat_times[end_beat])

    # Crossfade: 2-8 bars worth
    bpm = float(np.atleast_1d(tempo)[0])
    bar_s = 4 * 60.0 / bpm if bpm > 0 else 2.0
    crossfade_bars = min(4, max(2, int((end_s - start_s) / bar_s / 8)))
    crossfade_s = round(crossfade_bars * bar_s, 2)

    loop_info = {
        "found": True,
        "start_s": round(start_s, 3),
        "end_s": round(end_s, 3),
        "crossfade_s": crossfade_s,
        "score": round(best["score"], 4),
    }

    meta["loop"] = loop_info
    meta_path.write_text(json.dumps(meta, indent=2))
    return loop_info
```

**Step 4: Run tests**

Run: `cd backend && PYTHONPATH="" .venv/bin/python -m pytest tests/test_loop_detect.py -v`

**Step 5: Commit**

```bash
git add backend/app/services/loop_detect.py backend/tests/test_loop_detect.py
git commit -m "feat: add loop detection service with chroma self-similarity"
```

---

### Task 4: Mixer Service

**Files:**
- Create: `backend/app/services/mixer.py`
- Create: `backend/tests/test_mixer.py`

**Step 1: Write failing tests**

```python
"""Tests for the mix rendering service."""

import numpy as np
import pytest
import soundfile as sf

from app.services.mixer import render_mix, render_loop, equal_power_crossfade


@pytest.fixture
def two_tracks(tmp_path):
    """Create two short stereo WAV files."""
    sr = 44100
    duration = 4.0
    samples = int(sr * duration)
    t = np.linspace(0, duration, samples, endpoint=False)

    track_a = np.stack([
        0.3 * np.sin(2 * np.pi * 440 * t),
        0.3 * np.sin(2 * np.pi * 440 * t),
    ], axis=-1).astype(np.float32)
    track_b = np.stack([
        0.3 * np.sin(2 * np.pi * 554 * t),
        0.3 * np.sin(2 * np.pi * 554 * t),
    ], axis=-1).astype(np.float32)

    path_a = tmp_path / "a.wav"
    path_b = tmp_path / "b.wav"
    sf.write(str(path_a), track_a, sr)
    sf.write(str(path_b), track_b, sr)

    return path_a, path_b, sr


def test_equal_power_crossfade_sums_near_one():
    n = 1000
    fade_in, fade_out = equal_power_crossfade(n)
    # Equal power: sum of squares should be ~1.0
    power_sum = fade_in ** 2 + fade_out ** 2
    assert np.allclose(power_sum, 1.0, atol=0.01)


def test_render_mix_creates_file(two_tracks, tmp_path):
    path_a, path_b, sr = two_tracks
    output = tmp_path / "mix.flac"
    crossfades = [{"duration_s": 1.0, "type": "equal_power"}]
    result = render_mix([path_a, path_b], crossfades, output, target_sr=sr)
    assert result.exists()
    info = sf.info(str(result))
    assert info.samplerate == sr


def test_render_mix_duration(two_tracks, tmp_path):
    path_a, path_b, sr = two_tracks
    output = tmp_path / "mix.wav"
    xfade_s = 1.0
    crossfades = [{"duration_s": xfade_s, "type": "equal_power"}]
    render_mix([path_a, path_b], crossfades, output, target_sr=sr, fmt="WAV")
    info = sf.info(str(output))
    expected = 4.0 + 4.0 - xfade_s
    assert abs(info.duration - expected) < 0.5


def test_render_mix_not_silent(two_tracks, tmp_path):
    path_a, path_b, sr = two_tracks
    output = tmp_path / "mix.flac"
    crossfades = [{"duration_s": 1.0, "type": "equal_power"}]
    render_mix([path_a, path_b], crossfades, output, target_sr=sr)
    data, _ = sf.read(str(output))
    rms = float(np.sqrt(np.mean(data ** 2)))
    assert rms > 0.01


def test_render_mix_not_clipped(two_tracks, tmp_path):
    path_a, path_b, sr = two_tracks
    output = tmp_path / "mix.flac"
    crossfades = [{"duration_s": 1.0, "type": "equal_power"}]
    render_mix([path_a, path_b], crossfades, output, target_sr=sr)
    data, _ = sf.read(str(output))
    assert np.max(np.abs(data)) <= 1.0


def test_render_mix_wav_format(two_tracks, tmp_path):
    path_a, path_b, sr = two_tracks
    output = tmp_path / "mix.wav"
    crossfades = [{"duration_s": 1.0, "type": "equal_power"}]
    render_mix([path_a, path_b], crossfades, output, target_sr=sr, fmt="WAV", bit_depth=24)
    info = sf.info(str(output))
    assert info.format == "WAV"
    assert info.subtype == "PCM_24"


def test_render_loop_creates_file(two_tracks, tmp_path):
    path_a, _, sr = two_tracks
    output = tmp_path / "loop.flac"
    result = render_loop(path_a, 0.5, 3.5, 0.5, output, target_sr=sr)
    assert result.exists()


def test_render_loop_duration(two_tracks, tmp_path):
    path_a, _, sr = two_tracks
    output = tmp_path / "loop.flac"
    render_loop(path_a, 0.5, 3.5, 0.5, output, target_sr=sr)
    info = sf.info(str(output))
    expected = 3.0 - 0.5  # (end - start) - crossfade
    assert abs(info.duration - expected) < 0.5
```

**Step 2: Run to verify failure**

Run: `cd backend && PYTHONPATH="" .venv/bin/python -m pytest tests/test_mixer.py -v`

**Step 3: Implement mixer**

```python
"""Mix rendering and loop export service."""

from pathlib import Path
from typing import Callable

import librosa
import numpy as np
import soundfile as sf


def equal_power_crossfade(n_samples: int) -> tuple[np.ndarray, np.ndarray]:
    """Generate equal-power crossfade curves."""
    t = np.linspace(0, 1, n_samples)
    fade_in = np.sqrt(t)
    fade_out = np.sqrt(1 - t)
    return fade_in, fade_out


def render_mix(
    track_paths: list[Path],
    crossfades: list[dict],
    output_path: Path,
    target_sr: int = 48000,
    fmt: str = "FLAC",
    bit_depth: int = 24,
    lufs_target: float = -14.0,
    progress_callback: Callable[[float], None] | None = None,
) -> Path:
    """Render a mix from ordered tracks with crossfades between them."""
    import pyloudnorm as pyln

    # Load and resample all tracks
    audios: list[np.ndarray] = []
    for i, path in enumerate(track_paths):
        y, sr = sf.read(str(path), dtype="float32")
        if sr != target_sr:
            if y.ndim == 2:
                channels = [
                    librosa.resample(y[:, c], orig_sr=sr, target_sr=target_sr)
                    for c in range(y.shape[1])
                ]
                y = np.stack(channels, axis=-1)
            else:
                y = librosa.resample(y, orig_sr=sr, target_sr=target_sr)
        if y.ndim == 1:
            y = np.stack([y, y], axis=-1)
        audios.append(y)
        if progress_callback:
            progress_callback((i + 1) / (len(track_paths) * 2))

    # Build output by concatenating with crossfades
    segments: list[np.ndarray] = []
    for i, audio in enumerate(audios):
        if i == 0:
            segments.append(audio)
        else:
            xfade = crossfades[i - 1]
            xfade_samples = int(xfade["duration_s"] * target_sr)
            xfade_samples = min(xfade_samples, len(segments[-1]), len(audio))

            fade_in, fade_out = equal_power_crossfade(xfade_samples)
            fade_in_2d = fade_in.reshape(-1, 1)
            fade_out_2d = fade_out.reshape(-1, 1)

            prev_tail = segments[-1][-xfade_samples:] * fade_out_2d
            curr_head = audio[:xfade_samples] * fade_in_2d
            overlap = prev_tail + curr_head

            segments[-1] = segments[-1][:-xfade_samples]
            segments.append(overlap)
            segments.append(audio[xfade_samples:])

        if progress_callback:
            progress_callback(0.5 + (i + 1) / (len(audios) * 2))

    mixed = np.concatenate(segments, axis=0)

    # LUFS normalization
    meter = pyln.Meter(target_sr)
    loudness = meter.integrated_loudness(mixed)
    if np.isfinite(loudness):
        mixed = pyln.normalize.loudness(mixed, loudness, lufs_target)

    mixed = np.clip(mixed, -1.0, 1.0)

    # Write output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    subtype = f"PCM_{bit_depth}" if fmt.upper() == "WAV" else None
    sf.write(str(output_path), mixed, target_sr, format=fmt.upper(), subtype=subtype)

    if progress_callback:
        progress_callback(1.0)

    return output_path


def render_loop(
    track_path: Path,
    loop_start: float,
    loop_end: float,
    crossfade_s: float,
    output_path: Path,
    target_sr: int = 48000,
    fmt: str = "FLAC",
    bit_depth: int = 24,
) -> Path:
    """Render a seamless loop file.

    Takes the loop region, crossfades the tail into the head so the file
    plays seamlessly on repeat in any audio player.
    """
    y, sr = sf.read(str(track_path), dtype="float32")
    if sr != target_sr:
        if y.ndim == 2:
            channels = [
                librosa.resample(y[:, c], orig_sr=sr, target_sr=target_sr)
                for c in range(y.shape[1])
            ]
            y = np.stack(channels, axis=-1)
        else:
            y = librosa.resample(y, orig_sr=sr, target_sr=target_sr)
    if y.ndim == 1:
        y = np.stack([y, y], axis=-1)

    start_sample = int(loop_start * target_sr)
    end_sample = int(loop_end * target_sr)
    xfade_samples = int(crossfade_s * target_sr)

    # Clamp
    start_sample = max(0, start_sample)
    end_sample = min(len(y), end_sample)
    loop_len = end_sample - start_sample
    xfade_samples = min(xfade_samples, loop_len // 2)

    loop_audio = y[start_sample:end_sample].copy()

    head = loop_audio[:xfade_samples]
    tail = loop_audio[-xfade_samples:]
    body = loop_audio[xfade_samples:-xfade_samples]

    fade_in, fade_out = equal_power_crossfade(xfade_samples)
    fade_in_2d = fade_in.reshape(-1, 1)
    fade_out_2d = fade_out.reshape(-1, 1)

    transition = tail * fade_out_2d + head * fade_in_2d
    output = np.concatenate([transition, body], axis=0)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    subtype = f"PCM_{bit_depth}" if fmt.upper() == "WAV" else None
    sf.write(str(output_path), output, target_sr, format=fmt.upper(), subtype=subtype)

    return output_path
```

**Step 4: Run tests**

Run: `cd backend && PYTHONPATH="" .venv/bin/python -m pytest tests/test_mixer.py -v`

**Step 5: Commit**

```bash
git add backend/app/services/mixer.py backend/tests/test_mixer.py
git commit -m "feat: add mix rendering and loop export service"
```

---

### Task 5: Mix Render Celery Task

**Files:**
- Create: `backend/app/tasks/mix_render.py`
- Create: `backend/tests/test_mix_render_task.py`

**Step 1: Write failing tests**

```python
"""Tests for the mix render Celery task."""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest
import soundfile as sf

from app.tasks.mix_render import render_mix_task, render_loop_task


@pytest.fixture
def mix_env(tmp_path, monkeypatch):
    """Set up dirs and fake tracks for mix rendering."""
    upload_dir = tmp_path / "uploads"
    meta_dir = upload_dir / ".meta"
    export_dir = tmp_path / "exports"
    arr_dir = tmp_path / "arrangements"
    meta_dir.mkdir(parents=True)
    export_dir.mkdir()
    arr_dir.mkdir()

    monkeypatch.setattr("app.tasks.mix_render.UPLOAD_DIR", upload_dir)
    monkeypatch.setattr("app.tasks.mix_render.EXPORTS_DIR", export_dir)
    monkeypatch.setattr("app.tasks.mix_render.ARRANGEMENTS_DIR", arr_dir)

    sr = 22050
    t = np.linspace(0, 3, 3 * sr, endpoint=False)

    for tid in ["t1", "t2"]:
        audio = 0.3 * np.sin(2 * np.pi * 440 * t)
        path = upload_dir / f"{tid}.wav"
        sf.write(str(path), audio.astype(np.float32), sr)
        meta = {
            "id": tid,
            "filename": f"{tid}.wav",
            "file_path": f"{tid}.wav",
            "bpm": 120,
            "key": "Am",
            "energy": 0.5,
            "duration": 3.0,
        }
        (meta_dir / f"{tid}.json").write_text(json.dumps(meta))

    arrangement = {
        "id": "arr_test123",
        "tracks": ["t1", "t2"],
        "crossfades": [{"from": "t1", "to": "t2", "duration_s": 1.0, "type": "equal_power"}],
        "total_duration_s": 5.0,
    }
    (arr_dir / "arr_test123.json").write_text(json.dumps(arrangement))

    return {
        "upload_dir": upload_dir,
        "export_dir": export_dir,
        "arr_dir": arr_dir,
        "arrangement_id": "arr_test123",
    }


@patch("app.tasks.mix_render.r")
def test_render_mix_task_produces_output(mock_redis, mix_env):
    result = render_mix_task.apply(
        kwargs={
            "arrangement_id": mix_env["arrangement_id"],
            "fmt": "WAV",
            "target_sr": 22050,
            "bit_depth": 16,
        }
    ).get()
    assert result["status"] == "complete"
    assert Path(result["output_path"]).exists()


@patch("app.tasks.mix_render.r")
def test_render_mix_task_broadcasts_progress(mock_redis, mix_env):
    render_mix_task.apply(
        kwargs={
            "arrangement_id": mix_env["arrangement_id"],
            "fmt": "WAV",
            "target_sr": 22050,
        }
    ).get()
    assert mock_redis.publish.call_count >= 2  # at least start + complete


@patch("app.tasks.mix_render.r")
def test_render_mix_task_missing_arrangement(mock_redis, mix_env):
    with pytest.raises(ValueError, match="not found"):
        render_mix_task.apply(
            kwargs={"arrangement_id": "nonexistent"}
        ).get()


@patch("app.tasks.mix_render.r")
def test_render_loop_task_produces_output(mock_redis, mix_env):
    # Add loop info to track metadata
    meta_path = mix_env["upload_dir"] / ".meta" / "t1.json"
    meta = json.loads(meta_path.read_text())
    meta["loop"] = {"found": True, "start_s": 0.5, "end_s": 2.5, "crossfade_s": 0.3, "score": 0.8}
    meta_path.write_text(json.dumps(meta))

    result = render_loop_task.apply(
        kwargs={
            "track_id": "t1",
            "fmt": "WAV",
            "target_sr": 22050,
        }
    ).get()
    assert result["status"] == "complete"
    assert Path(result["output_path"]).exists()
```

**Step 2: Run to verify failure**

Run: `cd backend && PYTHONPATH="" .venv/bin/python -m pytest tests/test_mix_render_task.py -v`

**Step 3: Implement Celery task**

```python
"""Celery tasks for mix rendering and loop export."""

import json
from pathlib import Path
from typing import Any

import redis
from loguru import logger

from app.tasks.celery_app import celery_app
from app.config import UPLOAD_DIR, EXPORTS_DIR, ARRANGEMENTS_DIR, REDIS_URL

r = redis.Redis.from_url(REDIS_URL)


def _broadcast(mix_id: str, status: str, progress: float, message: str = "") -> None:
    payload = json.dumps({
        "type": "progress",
        "track_id": mix_id,
        "stage": "mix_render",
        "status": status,
        "progress": progress,
        "message": message,
    })
    r.publish("pipeline_progress", payload)


@celery_app.task(bind=True)
def render_mix_task(
    self,
    arrangement_id: str,
    fmt: str = "FLAC",
    target_sr: int = 48000,
    bit_depth: int = 24,
    lufs_target: float = -14.0,
) -> dict[str, Any]:
    """Render an arrangement to a single audio file."""
    from app.services.mixer import render_mix

    arr_path = ARRANGEMENTS_DIR / f"{arrangement_id}.json"
    if not arr_path.exists():
        raise ValueError(f"Arrangement not found: {arrangement_id}")

    arrangement = json.loads(arr_path.read_text())
    _broadcast(arrangement_id, "processing", 0.0, "Loading tracks")

    meta_dir = UPLOAD_DIR / ".meta"
    track_paths = []
    for tid in arrangement["tracks"]:
        meta = json.loads((meta_dir / f"{tid}.json").read_text())
        track_paths.append(UPLOAD_DIR / meta["file_path"])

    ext = "flac" if fmt.upper() == "FLAC" else "wav"
    output_path = EXPORTS_DIR / arrangement_id / f"mix.{ext}"

    def progress_cb(p: float) -> None:
        _broadcast(arrangement_id, "processing", p, "Rendering mix")

    render_mix(
        track_paths=track_paths,
        crossfades=arrangement["crossfades"],
        output_path=output_path,
        target_sr=target_sr,
        fmt=fmt,
        bit_depth=bit_depth,
        lufs_target=lufs_target,
        progress_callback=progress_cb,
    )

    _broadcast(arrangement_id, "complete", 1.0, "Mix complete")
    logger.info("Mix render complete: {}", output_path)

    return {
        "status": "complete",
        "arrangement_id": arrangement_id,
        "output_path": str(output_path),
    }


@celery_app.task(bind=True)
def render_loop_task(
    self,
    track_id: str,
    fmt: str = "FLAC",
    target_sr: int = 48000,
    bit_depth: int = 24,
) -> dict[str, Any]:
    """Render a seamless loop export for a single track."""
    from app.services.mixer import render_loop

    meta_dir = UPLOAD_DIR / ".meta"
    meta_path = meta_dir / f"{track_id}.json"
    if not meta_path.exists():
        raise ValueError(f"Track metadata not found: {track_id}")

    meta = json.loads(meta_path.read_text())
    loop = meta.get("loop")
    if not loop or not loop.get("found"):
        raise ValueError(f"No loop detected for track: {track_id}")

    audio_path = UPLOAD_DIR / meta["file_path"]
    ext = "flac" if fmt.upper() == "FLAC" else "wav"
    output_path = EXPORTS_DIR / track_id / f"loop.{ext}"

    _broadcast(track_id, "processing", 0.0, "Rendering loop")

    render_loop(
        track_path=audio_path,
        loop_start=loop["start_s"],
        loop_end=loop["end_s"],
        crossfade_s=loop["crossfade_s"],
        output_path=output_path,
        target_sr=target_sr,
        fmt=fmt,
        bit_depth=bit_depth,
    )

    _broadcast(track_id, "complete", 1.0, "Loop export complete")
    logger.info("Loop export complete: {}", output_path)

    return {
        "status": "complete",
        "track_id": track_id,
        "output_path": str(output_path),
    }
```

**Step 4: Run tests**

Run: `cd backend && PYTHONPATH="" .venv/bin/python -m pytest tests/test_mix_render_task.py -v`

**Step 5: Commit**

```bash
git add backend/app/tasks/mix_render.py backend/tests/test_mix_render_task.py
git commit -m "feat: add Celery tasks for mix rendering and loop export"
```

---

### Task 6: API Routes

**Files:**
- Create: `backend/app/routes/arrange.py`
- Create: `backend/tests/test_arrange_api.py`
- Modify: `backend/app/main.py`

**Step 1: Write failing tests**

```python
"""Tests for arrangement, loop, and mix API routes."""

import json
from unittest.mock import patch, MagicMock

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.config import UPLOAD_DIR, ARRANGEMENTS_DIR, EXPORTS_DIR


@pytest.fixture
def setup_tracks(tmp_path, monkeypatch):
    upload_dir = tmp_path / "uploads"
    meta_dir = upload_dir / ".meta"
    arr_dir = tmp_path / "arrangements"
    export_dir = tmp_path / "exports"
    meta_dir.mkdir(parents=True)
    arr_dir.mkdir()
    export_dir.mkdir()

    monkeypatch.setattr("app.routes.arrange.UPLOAD_DIR", upload_dir)
    monkeypatch.setattr("app.routes.arrange.ARRANGEMENTS_DIR", arr_dir)
    monkeypatch.setattr("app.routes.arrange.EXPORTS_DIR", export_dir)
    monkeypatch.setattr("app.services.arrangement.UPLOAD_DIR", upload_dir)
    monkeypatch.setattr("app.services.arrangement.ARRANGEMENTS_DIR", arr_dir)

    for tid, energy in [("t1", 0.2), ("t2", 0.8)]:
        meta = {
            "id": tid, "filename": f"{tid}.mp3", "file_path": f"{tid}.mp3",
            "bpm": 120, "key": "Am", "energy": energy, "duration": 180,
        }
        (meta_dir / f"{tid}.json").write_text(json.dumps(meta))

    return {"upload_dir": upload_dir, "arr_dir": arr_dir}


@pytest.mark.asyncio
async def test_arrange_endpoint(setup_tracks):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/api/arrange", json={"track_ids": ["t1", "t2"]})
    assert res.status_code == 200
    data = res.json()
    assert "tracks" in data
    assert len(data["tracks"]) == 2
    assert len(data["crossfades"]) == 1


@pytest.mark.asyncio
async def test_arrange_empty(setup_tracks):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/api/arrange", json={"track_ids": []})
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_loop_endpoint_missing_track(setup_tracks):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/api/loop/nonexistent")
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_mix_render_endpoint(setup_tracks):
    # Create an arrangement first
    arr = {
        "id": "arr_test",
        "tracks": ["t1", "t2"],
        "crossfades": [{"from": "t1", "to": "t2", "duration_s": 5.0, "type": "equal_power"}],
        "total_duration_s": 355.0,
    }
    (setup_tracks["arr_dir"] / "arr_test.json").write_text(json.dumps(arr))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with patch("app.routes.arrange.render_mix_task") as mock_task:
            mock_task.delay.return_value = MagicMock(id="celery_123")
            res = await client.post("/api/mix/render", json={
                "arrangement_id": "arr_test",
                "format": "FLAC",
                "sample_rate": 48000,
                "bit_depth": 24,
            })
    assert res.status_code == 200
    assert res.json()["task_id"] == "celery_123"


@pytest.mark.asyncio
async def test_mix_status_404(setup_tracks):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/mix/status/nonexistent")
    assert res.status_code == 404
```

**Step 2: Run to verify failure**

Run: `cd backend && PYTHONPATH="" .venv/bin/python -m pytest tests/test_arrange_api.py -v`

**Step 3: Implement API routes**

```python
"""API routes for arrangement, loop detection, and mix rendering."""

import json
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import UPLOAD_DIR, ARRANGEMENTS_DIR, EXPORTS_DIR

router = APIRouter(prefix="/api", tags=["arrange"])


class ArrangeRequest(BaseModel):
    track_ids: list[str]


class MixRenderRequest(BaseModel):
    arrangement_id: str
    format: str = "FLAC"
    sample_rate: int = 48000
    bit_depth: int = 24
    lufs_target: float = -14.0


@router.post("/arrange")
async def arrange_tracks(request: ArrangeRequest):
    """Auto-arrange tracks by energy arc + key/BPM compatibility."""
    from app.services.arrangement import auto_arrange

    if not request.track_ids:
        raise HTTPException(status_code=400, detail="No track IDs provided")

    try:
        result = auto_arrange(request.track_ids)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return result


@router.post("/loop/{track_id}")
async def detect_loop_endpoint(track_id: str):
    """Detect loop points for a single track."""
    from app.services.loop_detect import detect_loop

    meta_path = UPLOAD_DIR / ".meta" / f"{track_id}.json"
    if not meta_path.exists():
        raise HTTPException(status_code=404, detail=f"Track not found: {track_id}")

    try:
        result = detect_loop(track_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return result


@router.post("/mix/render")
async def render_mix_endpoint(request: MixRenderRequest):
    """Queue a mix render task."""
    from app.tasks.mix_render import render_mix_task

    arr_path = ARRANGEMENTS_DIR / f"{request.arrangement_id}.json"
    if not arr_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Arrangement not found: {request.arrangement_id}",
        )

    task = render_mix_task.delay(
        arrangement_id=request.arrangement_id,
        fmt=request.format,
        target_sr=request.sample_rate,
        bit_depth=request.bit_depth,
        lufs_target=request.lufs_target,
    )

    return {"task_id": task.id, "arrangement_id": request.arrangement_id}


@router.get("/mix/status/{mix_id}")
async def get_mix_status(mix_id: str):
    """Check mix render status by looking for output file."""
    for ext in ["flac", "wav"]:
        output_path = EXPORTS_DIR / mix_id / f"mix.{ext}"
        if output_path.exists():
            return {
                "status": "complete",
                "mix_id": mix_id,
                "output_path": f"/audio/exports/{mix_id}/mix.{ext}",
            }

    return {"status": "pending", "mix_id": mix_id}
```

**Step 4: Wire routes into main.py**

Add to `backend/app/main.py`:

```python
from app.routes.arrange import router as arrange_router
# ...
app.include_router(arrange_router)
```

**Step 5: Run tests**

Run: `cd backend && PYTHONPATH="" .venv/bin/python -m pytest tests/test_arrange_api.py -v`

**Step 6: Run full backend suite**

Run: `cd backend && PYTHONPATH="" .venv/bin/python -m pytest tests/ --ignore=tests/test_separation.py -v`

**Step 7: Commit**

```bash
git add backend/app/routes/arrange.py backend/tests/test_arrange_api.py backend/app/main.py
git commit -m "feat: add API routes for arrangement, loop detection, and mix rendering"
```

---

### Task 7: Frontend Arrangement Store

**Files:**
- Create: `frontend/src/stores/arrangement.ts`
- Create: `frontend/src/stores/__tests__/arrangement.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { useArrangementStore } from "../arrangement";

describe("arrangement store", () => {
  beforeEach(() => {
    useArrangementStore.setState(useArrangementStore.getInitialState());
  });

  it("starts empty", () => {
    const state = useArrangementStore.getState();
    expect(state.tracks).toEqual([]);
    expect(state.crossfades).toEqual([]);
    expect(state.renderStatus).toBe("idle");
  });

  it("sets arrangement", () => {
    const { setArrangement } = useArrangementStore.getState();
    setArrangement({
      id: "arr_1",
      tracks: ["t1", "t2"],
      crossfades: [{ from: "t1", to: "t2", duration_s: 5, type: "equal_power" }],
      total_duration_s: 300,
    });
    const state = useArrangementStore.getState();
    expect(state.tracks).toEqual(["t1", "t2"]);
    expect(state.crossfades).toHaveLength(1);
    expect(state.arrangementId).toBe("arr_1");
  });

  it("updates crossfade duration", () => {
    const { setArrangement, updateCrossfade } = useArrangementStore.getState();
    setArrangement({
      id: "arr_1",
      tracks: ["t1", "t2"],
      crossfades: [{ from: "t1", to: "t2", duration_s: 5, type: "equal_power" }],
      total_duration_s: 300,
    });
    updateCrossfade(0, 10);
    expect(useArrangementStore.getState().crossfades[0].duration_s).toBe(10);
  });

  it("excludes a track", () => {
    const { toggleExclude } = useArrangementStore.getState();
    toggleExclude("t2");
    expect(useArrangementStore.getState().excluded.has("t2")).toBe(true);
    toggleExclude("t2");
    expect(useArrangementStore.getState().excluded.has("t2")).toBe(false);
  });

  it("sets loop info", () => {
    const { setLoop } = useArrangementStore.getState();
    setLoop("t1", { found: true, start_s: 1, end_s: 10, crossfade_s: 2, score: 0.9 });
    expect(useArrangementStore.getState().loops["t1"]?.found).toBe(true);
  });

  it("sets render status", () => {
    const { setRenderStatus } = useArrangementStore.getState();
    setRenderStatus("rendering");
    expect(useArrangementStore.getState().renderStatus).toBe("rendering");
  });

  it("sets export settings", () => {
    const { setExportSettings } = useArrangementStore.getState();
    setExportSettings({ format: "WAV", sampleRate: 96000 });
    const s = useArrangementStore.getState().exportSettings;
    expect(s.format).toBe("WAV");
    expect(s.sampleRate).toBe(96000);
  });
});
```

**Step 2: Run to verify failure**

Run: `cd frontend && source ~/.nvm/nvm.sh && nvm use default && npx vitest run src/stores/__tests__/arrangement.test.ts`

**Step 3: Implement store**

```typescript
import { create } from "zustand";

export interface Crossfade {
  from: string;
  to: string;
  duration_s: number;
  type: string;
}

export interface LoopInfo {
  found: boolean;
  start_s: number;
  end_s: number;
  crossfade_s: number;
  score: number;
}

export interface ExportSettings {
  format: "FLAC" | "WAV";
  sampleRate: 44100 | 48000 | 96000;
  bitDepth: 16 | 24;
  lufsTarget: number;
}

type RenderStatus = "idle" | "rendering" | "complete";

interface ArrangementState {
  arrangementId: string | null;
  tracks: string[];
  crossfades: Crossfade[];
  totalDuration: number;
  excluded: Set<string>;
  loops: Record<string, LoopInfo>;
  exportSettings: ExportSettings;
  renderStatus: RenderStatus;
  setArrangement: (arr: {
    id: string;
    tracks: string[];
    crossfades: Crossfade[];
    total_duration_s: number;
  }) => void;
  updateCrossfade: (index: number, duration_s: number) => void;
  toggleExclude: (trackId: string) => void;
  setLoop: (trackId: string, loop: LoopInfo) => void;
  setExportSettings: (settings: Partial<ExportSettings>) => void;
  setRenderStatus: (status: RenderStatus) => void;
  reset: () => void;
}

const defaultExport: ExportSettings = {
  format: "FLAC",
  sampleRate: 48000,
  bitDepth: 24,
  lufsTarget: -14,
};

export const useArrangementStore = create<ArrangementState>()((set) => ({
  arrangementId: null,
  tracks: [],
  crossfades: [],
  totalDuration: 0,
  excluded: new Set<string>(),
  loops: {},
  exportSettings: { ...defaultExport },
  renderStatus: "idle",

  setArrangement: (arr) =>
    set({
      arrangementId: arr.id,
      tracks: arr.tracks,
      crossfades: arr.crossfades,
      totalDuration: arr.total_duration_s,
    }),

  updateCrossfade: (index, duration_s) =>
    set((state) => ({
      crossfades: state.crossfades.map((xf, i) =>
        i === index ? { ...xf, duration_s } : xf
      ),
    })),

  toggleExclude: (trackId) =>
    set((state) => {
      const next = new Set(state.excluded);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return { excluded: next };
    }),

  setLoop: (trackId, loop) =>
    set((state) => ({ loops: { ...state.loops, [trackId]: loop } })),

  setExportSettings: (settings) =>
    set((state) => ({
      exportSettings: { ...state.exportSettings, ...settings },
    })),

  setRenderStatus: (status) => set({ renderStatus: status }),

  reset: () =>
    set({
      arrangementId: null,
      tracks: [],
      crossfades: [],
      totalDuration: 0,
      excluded: new Set(),
      loops: {},
      renderStatus: "idle",
    }),
}));
```

**Step 4: Run tests**

Run: `cd frontend && source ~/.nvm/nvm.sh && nvm use default && npx vitest run`

**Step 5: Commit**

```bash
git add frontend/src/stores/arrangement.ts frontend/src/stores/__tests__/arrangement.test.ts
git commit -m "feat: add arrangement Zustand store with crossfade and loop state"
```

---

### Task 8: Frontend API Hooks & UI Store Update

**Files:**
- Modify: `frontend/src/hooks/useApi.ts`
- Modify: `frontend/src/stores/ui.ts`

**Step 1: Add API hooks**

Append to `useApi.ts`:

```typescript
export async function arrangeTrack(trackIds: string[]) {
  const res = await fetch(`${API_BASE}/arrange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ track_ids: trackIds }),
  });
  if (!res.ok) throw new Error("Arrangement failed");
  return res.json();
}

export async function detectLoop(trackId: string) {
  const res = await fetch(`${API_BASE}/loop/${trackId}`, { method: "POST" });
  if (!res.ok) throw new Error("Loop detection failed");
  return res.json();
}

export async function renderMix(
  arrangementId: string,
  format: string = "FLAC",
  sampleRate: number = 48000,
  bitDepth: number = 24,
  lufsTarget: number = -14,
) {
  const res = await fetch(`${API_BASE}/mix/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      arrangement_id: arrangementId,
      format,
      sample_rate: sampleRate,
      bit_depth: bitDepth,
      lufs_target: lufsTarget,
    }),
  });
  if (!res.ok) throw new Error("Mix render failed");
  return res.json();
}

export async function getMixStatus(mixId: string) {
  const res = await fetch(`${API_BASE}/mix/status/${mixId}`);
  if (!res.ok) throw new Error("Mix status not found");
  return res.json();
}
```

**Step 2: Update UI store for view modes**

Replace `ui.ts` content:

```typescript
import { create } from "zustand";

type MainView = "waveform" | "timeline";
type Panel = "library" | "pipeline";

interface UIState {
  mainView: MainView;
  openPanels: Set<Panel>;
  setMainView: (view: MainView) => void;
  togglePanel: (panel: Panel) => void;
}

export const useUIStore = create<UIState>((set) => ({
  mainView: "waveform",
  openPanels: new Set<Panel>(["library"]),
  setMainView: (view) => set({ mainView: view }),
  togglePanel: (panel) =>
    set((state) => {
      const next = new Set(state.openPanels);
      if (next.has(panel)) {
        next.delete(panel);
      } else {
        next.add(panel);
      }
      return { openPanels: next };
    }),
}));
```

Note: Removes the `view: "studio" | "sleep"` field (sleep mode is Phase 5, not needed yet). Adds `mainView: "waveform" | "timeline"`.

**Step 3: Fix any references to old `view` / `setView` fields**

Search codebase for `setView`, `state.view` -- only exists in `ui.ts` itself, no other references. Safe.

**Step 4: Run all frontend tests**

Run: `cd frontend && source ~/.nvm/nvm.sh && nvm use default && npx vitest run`

**Step 5: Commit**

```bash
git add frontend/src/hooks/useApi.ts frontend/src/stores/ui.ts
git commit -m "feat: add arrangement API hooks and timeline view mode to UI store"
```

---

### Task 9: Timeline Components

**Files:**
- Create: `frontend/src/components/timeline/TimelineTrack.tsx`
- Create: `frontend/src/components/timeline/Timeline.tsx`
- Create: `frontend/src/components/timeline/ArrangeControls.tsx`

**Step 1: Create TimelineTrack**

```typescript
import type { Track } from "../../stores/library";

interface TimelineTrackProps {
  track: Track;
  widthPercent: number;
  excluded: boolean;
  onToggleExclude: () => void;
}

export function TimelineTrack({
  track,
  widthPercent,
  excluded,
  onToggleExclude,
}: TimelineTrackProps) {
  return (
    <div
      className={`relative h-14 rounded border transition-colors flex-shrink-0 ${
        excluded
          ? "border-neutral-800 opacity-30"
          : "border-neutral-700 hover:border-neutral-600"
      }`}
      style={{ width: `${widthPercent}%`, minWidth: "80px" }}
    >
      {/* Energy fill */}
      <div
        className="absolute inset-0 rounded bg-neutral-800"
        style={{ width: `${Math.round(track.energy * 100)}%`, opacity: 0.4 }}
      />

      <div className="relative p-2 flex flex-col justify-between h-full">
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-300 truncate max-w-[80%]">
            {track.filename}
          </span>
          <button
            onClick={onToggleExclude}
            className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
            aria-label={excluded ? "Include track" : "Exclude track"}
          >
            {excluded ? "+" : "x"}
          </button>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-neutral-500 font-mono">
          <span>{Math.floor(track.duration / 60)}:{String(Math.floor(track.duration % 60)).padStart(2, "0")}</span>
          <span>{track.bpm.toFixed(0)} bpm</span>
          <span>{track.key}</span>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Create Timeline**

```typescript
import { useArrangementStore } from "../../stores/arrangement";
import { useLibraryStore } from "../../stores/library";
import { TimelineTrack } from "./TimelineTrack";

export function Timeline() {
  const { tracks: trackIds, crossfades, totalDuration, excluded, toggleExclude } =
    useArrangementStore();
  const { tracks: libraryTracks } = useLibraryStore();

  if (trackIds.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-600 text-sm">
        No arrangement yet. Select tracks and click Auto Arrange.
      </div>
    );
  }

  const getTrack = (id: string) => libraryTracks.find((t) => t.id === id);

  return (
    <div className="flex-1 flex items-center gap-0 px-4 overflow-x-auto min-h-0">
      {trackIds.map((tid, i) => {
        const track = getTrack(tid);
        if (!track) return null;

        const widthPercent = totalDuration > 0
          ? (track.duration / totalDuration) * 100
          : 100 / trackIds.length;

        return (
          <div key={tid} className="flex items-center">
            <TimelineTrack
              track={track}
              widthPercent={widthPercent}
              excluded={excluded.has(tid)}
              onToggleExclude={() => toggleExclude(tid)}
            />
            {i < trackIds.length - 1 && crossfades[i] && (
              <div className="flex-shrink-0 w-8 flex flex-col items-center justify-center">
                <div className="w-px h-8 bg-neutral-700" />
                <span className="text-[9px] text-neutral-600 font-mono">
                  {crossfades[i].duration_s.toFixed(1)}s
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

**Step 3: Create ArrangeControls**

```typescript
import { useState } from "react";
import { useArrangementStore } from "../../stores/arrangement";
import { useLibraryStore } from "../../stores/library";
import { arrangeTrack, detectLoop, renderMix } from "../../hooks/useApi";

export function ArrangeControls() {
  const { tracks: libraryTracks } = useLibraryStore();
  const {
    arrangementId,
    tracks,
    crossfades,
    excluded,
    loops,
    exportSettings,
    renderStatus,
    setArrangement,
    updateCrossfade,
    setLoop,
    setExportSettings,
    setRenderStatus,
  } = useArrangementStore();

  const [arranging, setArranging] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableIds = libraryTracks
    .map((t) => t.id)
    .filter((id) => !excluded.has(id));

  async function handleArrange() {
    if (availableIds.length < 2) return;
    setArranging(true);
    setError(null);
    try {
      const result = await arrangeTrack(availableIds);
      setArrangement(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Arrangement failed");
    } finally {
      setArranging(false);
    }
  }

  async function handleDetectLoop(trackId: string) {
    setDetecting(true);
    setError(null);
    try {
      const result = await detectLoop(trackId);
      setLoop(trackId, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Loop detection failed");
    } finally {
      setDetecting(false);
    }
  }

  async function handleRender() {
    if (!arrangementId) return;
    setRenderStatus("rendering");
    setError(null);
    try {
      await renderMix(
        arrangementId,
        exportSettings.format,
        exportSettings.sampleRate,
        exportSettings.bitDepth,
        exportSettings.lufsTarget,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Render failed");
      setRenderStatus("idle");
    }
  }

  return (
    <div className="h-full flex flex-col p-3 gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleArrange}
          disabled={availableIds.length < 2 || arranging}
          className="px-3 py-1.5 text-xs font-medium rounded bg-neutral-100 text-neutral-950 hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {arranging ? "Arranging..." : "Auto Arrange"}
        </button>

        {tracks.length > 0 && tracks[0] && (
          <button
            onClick={() => handleDetectLoop(tracks[0])}
            disabled={detecting}
            className="px-3 py-1.5 text-xs font-medium rounded border border-neutral-700 text-neutral-300 hover:border-neutral-500 disabled:opacity-40 transition-colors"
          >
            {detecting ? "Detecting..." : "Find Loops"}
          </button>
        )}

        <div className="flex items-center gap-1 ml-auto">
          <select
            value={exportSettings.format}
            onChange={(e) => setExportSettings({ format: e.target.value as "FLAC" | "WAV" })}
            className="text-xs bg-neutral-900 border border-neutral-800 rounded px-1.5 py-1 text-neutral-300"
          >
            <option value="FLAC">FLAC</option>
            <option value="WAV">WAV</option>
          </select>

          <select
            value={exportSettings.sampleRate}
            onChange={(e) => setExportSettings({ sampleRate: Number(e.target.value) as 44100 | 48000 | 96000 })}
            className="text-xs bg-neutral-900 border border-neutral-800 rounded px-1.5 py-1 text-neutral-300"
          >
            <option value={44100}>44.1kHz</option>
            <option value={48000}>48kHz</option>
            <option value={96000}>96kHz</option>
          </select>

          <select
            value={exportSettings.bitDepth}
            onChange={(e) => setExportSettings({ bitDepth: Number(e.target.value) as 16 | 24 })}
            className="text-xs bg-neutral-900 border border-neutral-800 rounded px-1.5 py-1 text-neutral-300"
          >
            <option value={16}>16-bit</option>
            <option value={24}>24-bit</option>
          </select>

          <button
            onClick={handleRender}
            disabled={!arrangementId || renderStatus === "rendering"}
            className="px-3 py-1.5 text-xs font-medium rounded bg-neutral-100 text-neutral-950 hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {renderStatus === "rendering" ? "Rendering..." : "Render Mix"}
          </button>
        </div>
      </div>

      {/* Per-crossfade sliders */}
      {crossfades.length > 0 && (
        <div className="flex gap-3 overflow-x-auto">
          {crossfades.map((xf, i) => (
            <div key={i} className="flex items-center gap-1 text-xs text-neutral-500">
              <span className="font-mono whitespace-nowrap">xf{i + 1}</span>
              <input
                type="range"
                min={3}
                max={15}
                step={0.5}
                value={xf.duration_s}
                onChange={(e) => updateCrossfade(i, parseFloat(e.target.value))}
                className="w-16 accent-neutral-400"
              />
              <span className="font-mono w-8">{xf.duration_s.toFixed(1)}s</span>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
```

**Step 4: Run tests**

Run: `cd frontend && source ~/.nvm/nvm.sh && nvm use default && npx vitest run`

**Step 5: Commit**

```bash
git add frontend/src/components/timeline/
git commit -m "feat: add Timeline, TimelineTrack, and ArrangeControls components"
```

---

### Task 10: Wire Timeline Into App

**Files:**
- Modify: `frontend/src/components/layout/TopBar.tsx`
- Modify: `frontend/src/components/layout/Layout.tsx`
- Modify: `frontend/src/App.tsx`

**Step 1: Update TopBar -- add Timeline/Waveform toggle**

Replace TopBar with:

```typescript
import { useUIStore } from "../../stores/ui";

interface TopBarProps {
  onToggleLibrary: () => void;
  onTogglePipeline: () => void;
}

export function TopBar({ onToggleLibrary, onTogglePipeline }: TopBarProps) {
  const { mainView, setMainView } = useUIStore();

  return (
    <header className="h-12 border-b border-neutral-800 flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-4">
        <span className="text-sm font-semibold tracking-tight text-neutral-100">
          audio engine
        </span>
        <span className="text-xs text-neutral-600 font-mono">v0.2</span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => setMainView("waveform")}
          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
            mainView === "waveform"
              ? "bg-neutral-800 text-neutral-100"
              : "text-neutral-500 hover:text-neutral-300"
          }`}
        >
          Waveform
        </button>
        <button
          onClick={() => setMainView("timeline")}
          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
            mainView === "timeline"
              ? "bg-neutral-800 text-neutral-100"
              : "text-neutral-500 hover:text-neutral-300"
          }`}
        >
          Timeline
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onToggleLibrary}
          className="px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 rounded transition-colors"
        >
          Library
        </button>
        <button
          onClick={onTogglePipeline}
          className="px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 rounded transition-colors"
        >
          Pipeline
        </button>
        <button className="px-3 py-1.5 text-xs font-medium bg-neutral-100 text-neutral-900 rounded hover:bg-neutral-200 transition-colors">
          Export
        </button>
      </div>
    </header>
  );
}
```

**Step 2: Update Layout -- support timeline view**

Add `timeline` prop and conditionally render based on `mainView`:

```typescript
import { TopBar } from "./TopBar";
import { Transport } from "./Transport";
import { useUIStore } from "../../stores/ui";

interface LayoutProps {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  pipeline?: React.ReactNode;
  timeline?: React.ReactNode;
  arrangeControls?: React.ReactNode;
}

export function Layout({ sidebar, main, pipeline, timeline, arrangeControls }: LayoutProps) {
  const { mainView, openPanels, togglePanel } = useUIStore();
  const showLibrary = openPanels.has("library");
  const showPipeline = openPanels.has("pipeline");

  const isTimeline = mainView === "timeline";

  return (
    <div className="h-screen flex flex-col bg-neutral-950 text-neutral-100 overflow-hidden">
      <TopBar
        onToggleLibrary={() => togglePanel("library")}
        onTogglePipeline={() => togglePanel("pipeline")}
      />

      <div className="flex flex-1 min-h-0">
        {showLibrary && (
          <aside className="w-72 border-r border-neutral-800 flex-shrink-0 overflow-y-auto">
            {sidebar}
          </aside>
        )}

        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-0">
            {isTimeline ? timeline : main}
          </div>

          {showPipeline && !isTimeline && pipeline && (
            <div className="border-t border-neutral-800 h-48 flex-shrink-0 overflow-y-auto">
              {pipeline}
            </div>
          )}

          {isTimeline && arrangeControls && (
            <div className="border-t border-neutral-800 h-32 flex-shrink-0 overflow-y-auto">
              {arrangeControls}
            </div>
          )}
        </main>
      </div>

      <Transport />
    </div>
  );
}
```

**Step 3: Update App.tsx**

```typescript
import { Layout } from "./components/layout/Layout";
import { LibraryPanel } from "./components/library/LibraryPanel";
import { PipelinePanel } from "./components/pipeline/PipelinePanel";
import { WaveformView } from "./components/visualizer/WaveformView";
import { Timeline } from "./components/timeline/Timeline";
import { ArrangeControls } from "./components/timeline/ArrangeControls";
import { useWebSocket } from "./hooks/useWebSocket";

function App() {
  useWebSocket();

  return (
    <Layout
      sidebar={<LibraryPanel />}
      main={<WaveformView />}
      pipeline={<PipelinePanel />}
      timeline={<Timeline />}
      arrangeControls={<ArrangeControls />}
    />
  );
}

export default App;
```

**Step 4: Run frontend tests**

Run: `cd frontend && source ~/.nvm/nvm.sh && nvm use default && npx vitest run`

**Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/layout/TopBar.tsx frontend/src/components/layout/Layout.tsx
git commit -m "feat: wire timeline view into layout with waveform/timeline toggle"
```

---

### Task 11: E2E Tests

**Files:**
- Create: `frontend/e2e/timeline.spec.ts`

**Step 1: Write E2E tests**

```typescript
import { test, expect } from "@playwright/test";

test.describe("Timeline", () => {
  test("waveform/timeline toggle buttons visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Waveform" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Timeline" })).toBeVisible();
  });

  test("switching to timeline view shows empty state", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Timeline" }).click();
    await expect(page.getByText("No arrangement yet")).toBeVisible();
  });

  test("switching back to waveform hides timeline", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Timeline" }).click();
    await expect(page.getByText("No arrangement yet")).toBeVisible();
    await page.getByRole("button", { name: "Waveform" }).click();
    await expect(page.getByText("No arrangement yet")).not.toBeVisible();
  });

  test("timeline shows arrange controls", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Timeline" }).click();
    await expect(page.getByRole("button", { name: "Auto Arrange" })).toBeVisible();
  });

  test("auto arrange disabled with fewer than 2 tracks", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Timeline" }).click();
    const btn = page.getByRole("button", { name: "Auto Arrange" });
    await expect(btn).toBeDisabled();
  });

  test("export format dropdowns present in timeline", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Timeline" }).click();
    const selects = page.locator("select");
    const count = await selects.count();
    expect(count).toBeGreaterThanOrEqual(3); // format, sample rate, bit depth
  });
});
```

**Step 2: Run E2E (requires app running)**

Run: `cd frontend && source ~/.nvm/nvm.sh && nvm use default && npx playwright test e2e/timeline.spec.ts`

**Step 3: Commit**

```bash
git add frontend/e2e/timeline.spec.ts
git commit -m "test: add E2E tests for timeline view toggle and arrange controls"
```

---

### Task 12: Install pyloudnorm dependency

**Files:**
- Modify: `backend/requirements.txt` (or pyproject.toml -- check which exists)

**Step 1: Check dependency file**

Run: `ls backend/requirements.txt backend/pyproject.toml 2>/dev/null`

**Step 2: Install pyloudnorm**

Run: `cd backend && .venv/bin/pip install pyloudnorm`

**Step 3: Add to dependency file and commit**

```bash
git add backend/requirements.txt  # or pyproject.toml
git commit -m "feat: add pyloudnorm dependency for LUFS normalization"
```

---

## Execution Order

Tasks 1-6 are backend (sequential, each builds on prior).
Tasks 7-10 are frontend (sequential, each builds on prior).
Task 11 is E2E (requires both backend + frontend complete).
Task 12 can run anytime before Task 4.

**Recommended parallel batches:**
1. Task 1 + Task 12 (config + dependency)
2. Task 2 (arrangement service)
3. Task 3 (loop detection)
4. Task 4 (mixer) -- depends on Task 12
5. Task 5 (Celery task)
6. Task 6 (API routes)
7. Task 7 (frontend store)
8. Task 8 (API hooks + UI store)
9. Task 9 (timeline components)
10. Task 10 (wiring)
11. Task 11 (E2E)
