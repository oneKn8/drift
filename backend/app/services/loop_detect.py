"""Loop point detection using chroma self-similarity at beat resolution."""

import json

import librosa
import numpy as np
from pathlib import Path

from app.config import UPLOAD_DIR


def _snap_to_nearest(t: float, beat_times: np.ndarray) -> float:
    """Snap a time value to the nearest beat.

    When equidistant between two beats, snaps to the later one.
    """
    diffs = np.abs(beat_times - t)
    min_diff = diffs.min()
    # Among all indices tied at the minimum distance, pick the last one
    # so that equidistant values round toward the later beat.
    candidates = np.where(np.isclose(diffs, min_diff, atol=1e-12))[0]
    idx = int(candidates[-1])
    return float(beat_times[idx])


def detect_loop(track_id: str) -> dict:
    """Detect the best seamless loop point in a track."""
    meta_dir = UPLOAD_DIR / ".meta"
    meta_path = meta_dir / f"{track_id}.json"
    if not meta_path.exists():
        raise ValueError(f"Track metadata not found: {track_id}")

    meta = json.loads(meta_path.read_text())
    audio_path = UPLOAD_DIR / meta["file_path"]

    y, sr = librosa.load(str(audio_path), sr=None, mono=True)
    duration = len(y) / sr

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

    # If beat tracker found too few beats, build a uniform grid from
    # metadata BPM (preferred) or detected tempo as fallback.
    if n_beats < 16:
        bpm_val = float(meta.get("bpm", 0))
        if bpm_val <= 0:
            bpm_val = float(np.atleast_1d(tempo)[0])
        if bpm_val <= 0:
            bpm_val = 120.0
        beat_interval = 60.0 / bpm_val
        grid_times = np.arange(beat_interval, duration, beat_interval)
        if len(grid_times) < 16:
            meta["loop"] = not_found
            meta_path.write_text(json.dumps(meta, indent=2))
            return not_found
        beat_times = grid_times
        beat_frames = librosa.time_to_frames(beat_times, sr=sr)
        n_beats = len(beat_times)

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    beat_chroma = librosa.util.sync(chroma, beat_frames)
    norms = np.linalg.norm(beat_chroma, axis=0, keepdims=True) + 1e-8
    beat_chroma_norm = beat_chroma / norms

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

            start_region = beat_chroma_norm[:, start : start + w]
            end_region = beat_chroma_norm[:, end - w : end]
            chroma_sim = float(np.mean(np.sum(start_region * end_region, axis=0)))

            start_rms = beat_rms[start : start + w]
            end_rms = beat_rms[end - w : end]
            energy_match = 1.0 - float(np.mean(np.abs(start_rms - end_rms))) / rms_mean
            energy_match = max(0.0, min(1.0, energy_match))

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
