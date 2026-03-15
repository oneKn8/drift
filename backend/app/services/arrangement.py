"""Auto-arrangement service using energy curve + key/BPM compatibility."""

import json
import uuid
from pathlib import Path

from app.config import UPLOAD_DIR, ARRANGEMENTS_DIR

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
    """Return compatibility score [0.0, 1.0] between two musical keys using the Camelot wheel.

    Scoring:
        - Identical position and letter: 1.0
        - Same number, different letter (relative major/minor): 0.6
        - Adjacent number, same letter: 0.8
        - Two steps apart, same letter: 0.3
        - Everything else (or unknown keys): 0.0
    """
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
    """Return compatibility score [0.0, 1.0] based on energy difference.

    Closer energy levels produce higher scores.
    """
    return 1.0 - abs(energy_a - energy_b)


def bpm_compatibility(bpm_a: float, bpm_b: float) -> float:
    """Return compatibility score [0.0, 1.0] based on BPM ratio.

    BPMs within 10% of each other score 1.0. Zero BPM returns 0.0.
    """
    if bpm_a == 0 or bpm_b == 0:
        return 0.0
    ratio = min(bpm_a, bpm_b) / max(bpm_a, bpm_b)
    if ratio >= 0.9:
        return 1.0
    return max(0.0, ratio)


def compute_score(track_a: dict, track_b: dict) -> float:
    """Compute weighted transition score between two tracks.

    Weights: energy 60%, key 30%, BPM 10%.
    """
    e = energy_compatibility(track_a["energy"], track_b["energy"])
    k = key_compatibility(track_a["key"], track_b["key"])
    b = bpm_compatibility(track_a["bpm"], track_b["bpm"])
    return 0.6 * e + 0.3 * k + 0.1 * b


def compute_crossfade_duration(bpm_a: float, bpm_b: float) -> float:
    """Compute crossfade duration in seconds based on BPM difference.

    Returns 3.0s for identical BPMs, scaling up to 15.0s for large differences.
    """
    if bpm_a == 0 or bpm_b == 0:
        return 8.0
    ratio = min(bpm_a, bpm_b) / max(bpm_a, bpm_b)
    return 3.0 + (1.0 - ratio) * 12.0


def auto_arrange(track_ids: list[str]) -> dict:
    """Auto-arrange tracks by energy curve with key/BPM-aware transitions.

    Starts with the lowest-energy track and greedily selects the next best
    track based on a weighted score of energy, key, and BPM compatibility.

    Args:
        track_ids: List of track IDs whose metadata files exist in UPLOAD_DIR/.meta/.

    Returns:
        Arrangement dict with id, ordered track list, crossfade specs, and total duration.

    Raises:
        ValueError: If a track ID has no metadata file, or no tracks are provided.
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
