"""Tests for the Demucs stem separation service."""

import shutil
import uuid
from pathlib import Path

import pytest

from app.config import PIPELINE_DIR, UPLOAD_DIR
from app.services.separation import separate_stems

EXPECTED_STEMS = {"vocals", "drums", "bass", "other"}


def _get_sample_mp3() -> Path:
    """Return path to a sample MP3 file from the uploads directory."""
    mp3_files = sorted(UPLOAD_DIR.glob("*.mp3"))
    if not mp3_files:
        pytest.skip("No sample MP3 files found in uploads directory")
    return mp3_files[0]


@pytest.fixture
def track_id():
    """Provide a unique track ID per test and clean up after."""
    tid = f"test_separation_{uuid.uuid4().hex[:8]}"
    yield tid
    # Cleanup
    output_dir = PIPELINE_DIR / tid
    if output_dir.exists():
        shutil.rmtree(output_dir)


class TestSeparateStems:
    """Tests for separate_stems function."""

    def test_separate_produces_stems(self, track_id: str) -> None:
        """Run separation on a sample MP3 and check all 4 stems exist."""
        sample = _get_sample_mp3()
        result = separate_stems(input_path=sample, track_id=track_id)

        # All expected stems must be present in the result dict
        assert set(result.keys()) == EXPECTED_STEMS, (
            f"Expected stems {EXPECTED_STEMS}, got {set(result.keys())}"
        )

        # Each stem file must exist and be non-empty
        for stem_name, stem_path_str in result.items():
            stem_path = Path(stem_path_str)
            assert stem_path.exists(), f"Stem '{stem_name}' file missing: {stem_path}"
            assert stem_path.stat().st_size > 0, (
                f"Stem '{stem_name}' file is empty: {stem_path}"
            )

    def test_separate_output_is_wav(self, track_id: str) -> None:
        """Check all stem outputs are .wav files."""
        sample = _get_sample_mp3()
        result = separate_stems(input_path=sample, track_id=track_id)

        for stem_name, stem_path_str in result.items():
            stem_path = Path(stem_path_str)
            assert stem_path.suffix == ".wav", (
                f"Stem '{stem_name}' is not a .wav file: {stem_path}"
            )

    def test_separate_file_not_found(self) -> None:
        """Verify FileNotFoundError is raised for a nonexistent input."""
        with pytest.raises(FileNotFoundError):
            separate_stems(
                input_path=Path("/tmp/nonexistent_audio_file.mp3"),
                track_id="test_missing",
            )
