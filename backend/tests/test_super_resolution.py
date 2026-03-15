"""Tests for the super-resolution audio upscaling service."""

import pytest
import soundfile as sf
from pathlib import Path

from app.services.super_resolution import upscale_audio

SAMPLE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "uploads"


def get_sample_file() -> Path:
    mp3s = list(SAMPLE_DIR.glob("*.mp3"))
    if not mp3s:
        pytest.skip("No MP3 files in data/uploads for testing")
    return mp3s[0]


def test_upscale_produces_output(tmp_path: Path) -> None:
    """Upscaled output file must exist and have non-zero size."""
    input_file = get_sample_file()
    track_id = "test_sr_output"

    result_path = upscale_audio(input_file, track_id)

    assert result_path.exists(), f"Output file does not exist: {result_path}"
    assert result_path.stat().st_size > 0, "Output file is empty"


def test_upscale_increases_sample_rate() -> None:
    """Upscaled output must have a sample rate of at least 44100 Hz."""
    input_file = get_sample_file()
    track_id = "test_sr_rate"

    result_path = upscale_audio(input_file, track_id)

    info = sf.info(str(result_path))
    assert info.samplerate >= 44100, (
        f"Expected sample rate >= 44100, got {info.samplerate}"
    )
