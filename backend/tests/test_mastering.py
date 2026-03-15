"""Tests for the matchering-based mastering service."""

import hashlib

import pytest
import soundfile as sf
from pathlib import Path

from app.services.mastering import master_track

SAMPLE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "uploads"


def _file_hash(path: Path) -> str:
    """Return MD5 hex digest for a file (used to detect identical content)."""
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def get_two_sample_files() -> tuple[Path, Path]:
    """Find two MP3 files with different audio content for target and reference."""
    mp3s = sorted(SAMPLE_DIR.glob("*.mp3"))
    if len(mp3s) < 2:
        pytest.skip("Need at least 2 MP3 files in data/uploads for testing")

    # Group by content hash and pick one file from two different groups
    seen: dict[str, Path] = {}
    for mp3 in mp3s:
        digest = _file_hash(mp3)
        if digest not in seen:
            seen[digest] = mp3
        if len(seen) >= 2:
            break

    if len(seen) < 2:
        pytest.skip("Need at least 2 distinct MP3 files (by content) for testing")

    files = list(seen.values())
    return files[0], files[1]


def test_master_produces_output() -> None:
    """Mastered output file must exist and have non-zero size."""
    target, reference = get_two_sample_files()
    track_id = "test_master_output"

    result_path = master_track(target, reference, track_id)

    assert result_path.exists(), f"Output file does not exist: {result_path}"
    assert result_path.stat().st_size > 0, "Output file is empty"


def test_master_preserves_duration() -> None:
    """Mastered output duration must be close to the target duration (within 1 sec)."""
    target, reference = get_two_sample_files()
    track_id = "test_master_duration"

    result_path = master_track(target, reference, track_id)

    target_info = sf.info(str(target))
    result_info = sf.info(str(result_path))

    assert abs(result_info.duration - target_info.duration) < 1.0, (
        f"Duration mismatch: target={target_info.duration:.2f}s, "
        f"result={result_info.duration:.2f}s"
    )
