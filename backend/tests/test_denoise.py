"""Tests for the DeepFilterNet denoise service."""

import shutil
from pathlib import Path

import pytest

from app.config import PIPELINE_DIR, UPLOAD_DIR
from app.services.denoise import denoise_track


def _get_sample_mp3() -> Path:
    """Return path to a sample MP3 file from the uploads directory."""
    mp3_files = sorted(UPLOAD_DIR.glob("*.mp3"))
    if not mp3_files:
        pytest.skip("No sample MP3 files found in uploads directory")
    return mp3_files[0]


@pytest.fixture
def track_id():
    """Provide a unique track ID and clean up after the test."""
    tid = "test_denoise_001"
    yield tid
    # Cleanup
    output_dir = PIPELINE_DIR / tid
    if output_dir.exists():
        shutil.rmtree(output_dir)


class TestDenoiseTrack:
    """Tests for denoise_track function."""

    def test_denoise_produces_output(self, track_id: str) -> None:
        """Run denoise_track on a sample MP3 and verify the output WAV exists with size > 0."""
        sample = _get_sample_mp3()
        result_path = denoise_track(input_path=sample, track_id=track_id)

        assert result_path.exists(), f"Output file does not exist: {result_path}"
        assert result_path.suffix == ".wav", f"Output is not a .wav file: {result_path}"
        assert result_path.stat().st_size > 0, "Output file is empty (0 bytes)"

    def test_denoise_output_in_pipeline_dir(self, track_id: str) -> None:
        """Verify that the output path is located within PIPELINE_DIR."""
        sample = _get_sample_mp3()
        result_path = denoise_track(input_path=sample, track_id=track_id)

        # Check that the output is under the expected pipeline directory
        assert str(PIPELINE_DIR) in str(result_path), (
            f"Output path {result_path} does not contain PIPELINE_DIR {PIPELINE_DIR}"
        )
        expected_dir = PIPELINE_DIR / track_id / "denoise"
        assert result_path.parent == expected_dir, (
            f"Output parent {result_path.parent} != expected {expected_dir}"
        )

    def test_denoise_file_not_found(self) -> None:
        """Verify FileNotFoundError is raised for a nonexistent input."""
        with pytest.raises(FileNotFoundError):
            denoise_track(
                input_path=Path("/tmp/nonexistent_audio_file.mp3"),
                track_id="test_missing",
            )
