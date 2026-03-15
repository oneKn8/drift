"""Tests for the pipeline orchestrator Celery task."""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.config import PIPELINE_DIR, UPLOAD_DIR
from app.tasks.pipeline import (
    _broadcast,
    _load_track_meta,
    _save_results,
    run_pipeline,
)

META_DIR = UPLOAD_DIR / ".meta"


@pytest.fixture
def fake_track(tmp_path, monkeypatch):
    """Create a fake track with metadata and audio file for testing."""
    track_id = "test_abc123"

    # Patch UPLOAD_DIR and PIPELINE_DIR to use tmp_path
    test_upload_dir = tmp_path / "uploads"
    test_upload_dir.mkdir()
    test_meta_dir = test_upload_dir / ".meta"
    test_meta_dir.mkdir()
    test_pipeline_dir = tmp_path / "pipeline"
    test_pipeline_dir.mkdir()

    monkeypatch.setattr("app.tasks.pipeline.UPLOAD_DIR", test_upload_dir)
    monkeypatch.setattr("app.tasks.pipeline.META_DIR", test_meta_dir)
    monkeypatch.setattr("app.tasks.pipeline.PIPELINE_DIR", test_pipeline_dir)

    # Create a fake audio file
    audio_file = test_upload_dir / f"{track_id}.wav"
    audio_file.write_bytes(b"fake audio data")

    # Create metadata
    meta = {
        "id": track_id,
        "filename": "test.wav",
        "file_path": f"{track_id}.wav",
    }
    meta_path = test_meta_dir / f"{track_id}.json"
    meta_path.write_text(json.dumps(meta))

    return {
        "track_id": track_id,
        "upload_dir": test_upload_dir,
        "meta_dir": test_meta_dir,
        "pipeline_dir": test_pipeline_dir,
        "audio_file": audio_file,
        "meta": meta,
    }


def test_import_pipeline_task():
    """Verify the pipeline task module can be imported."""
    from app.tasks.pipeline import run_pipeline
    assert callable(run_pipeline)


def test_load_track_meta_exists(fake_track):
    """Loading metadata for an existing track returns the dict."""
    meta = _load_track_meta(fake_track["track_id"])
    assert meta is not None
    assert meta["id"] == fake_track["track_id"]


def test_load_track_meta_missing(fake_track):
    """Loading metadata for a nonexistent track returns None."""
    meta = _load_track_meta("nonexistent_id")
    assert meta is None


@patch("app.tasks.pipeline.r")
def test_broadcast_publishes_to_redis(mock_redis):
    """Broadcast should publish a JSON message to the pipeline_progress channel."""
    _broadcast("track123", "denoise", "processing", 0.25, "Starting denoise")
    mock_redis.publish.assert_called_once()
    call_args = mock_redis.publish.call_args
    assert call_args[0][0] == "pipeline_progress"
    payload = json.loads(call_args[0][1])
    assert payload["type"] == "progress"
    assert payload["track_id"] == "track123"
    assert payload["stage"] == "denoise"
    assert payload["status"] == "processing"
    assert payload["progress"] == 0.25


def test_save_results(fake_track):
    """Results should be saved to the correct path as valid JSON."""
    results = {"track_id": fake_track["track_id"], "status": "complete"}
    results_path = _save_results(fake_track["track_id"], results)

    # _save_results uses the module-level PIPELINE_DIR which was monkeypatched
    assert results_path.exists()
    loaded = json.loads(results_path.read_text())
    assert loaded["status"] == "complete"


@patch("app.tasks.pipeline.r")
@patch("app.tasks.pipeline._run_denoise")
def test_run_pipeline_single_stage_denoise(mock_denoise, mock_redis, fake_track):
    """Running pipeline with only denoise stage should call denoise and save results."""
    output_path = fake_track["pipeline_dir"] / fake_track["track_id"] / "denoise" / "denoised.wav"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(b"denoised audio")

    mock_denoise.return_value = {"output_path": str(output_path)}

    result = run_pipeline.apply(
        args=[fake_track["track_id"]],
        kwargs={"stages": ["denoise"]},
    ).get()

    assert result["status"] == "complete"
    assert "denoise" in result["stages"]
    assert result["stages"]["denoise"]["status"] == "complete"
    mock_denoise.assert_called_once()


@patch("app.tasks.pipeline.r")
def test_run_pipeline_missing_track(mock_redis, fake_track):
    """Pipeline should raise ValueError for a nonexistent track."""
    with pytest.raises(ValueError, match="Track metadata not found"):
        run_pipeline.apply(
            args=["nonexistent_track_id"],
            kwargs={"stages": ["denoise"]},
        ).get()


@patch("app.tasks.pipeline.r")
def test_run_pipeline_invalid_stage(mock_redis, fake_track):
    """Pipeline should raise ValueError for unknown stages."""
    with pytest.raises(ValueError, match="Unknown pipeline stages"):
        run_pipeline.apply(
            args=[fake_track["track_id"]],
            kwargs={"stages": ["nonexistent_stage"]},
        ).get()


@patch("app.tasks.pipeline.r")
@patch("app.tasks.pipeline._run_denoise")
def test_run_pipeline_stage_failure_saves_partial_results(
    mock_denoise, mock_redis, fake_track
):
    """When a stage fails, partial results should be saved with 'failed' status."""
    mock_denoise.side_effect = RuntimeError("Denoise blew up")

    with pytest.raises(RuntimeError, match="Denoise blew up"):
        run_pipeline.apply(
            args=[fake_track["track_id"]],
            kwargs={"stages": ["denoise"]},
        ).get()

    # Verify partial results were saved
    results_path = (
        fake_track["pipeline_dir"]
        / fake_track["track_id"]
        / "pipeline_results.json"
    )
    assert results_path.exists()
    loaded = json.loads(results_path.read_text())
    assert loaded["status"] == "failed"
    assert loaded["stages"]["denoise"]["status"] == "failed"


@patch("app.tasks.pipeline.r")
@patch("app.tasks.pipeline._run_master")
@patch("app.tasks.pipeline._run_super_resolution")
@patch("app.tasks.pipeline._run_separate")
@patch("app.tasks.pipeline._run_denoise")
def test_run_pipeline_full_four_stage_chain(
    mock_denoise, mock_separate, mock_super_res, mock_master, mock_redis, fake_track
):
    """Full 4-stage pipeline chains outputs correctly: each stage receives previous output."""
    tid = fake_track["track_id"]
    pdir = fake_track["pipeline_dir"] / tid

    # Create fake output files for each stage
    denoise_out = pdir / "denoise" / "denoised.wav"
    denoise_out.parent.mkdir(parents=True, exist_ok=True)
    denoise_out.write_bytes(b"denoised")

    separate_out = pdir / "stems" / "other.wav"
    separate_out.parent.mkdir(parents=True, exist_ok=True)
    separate_out.write_bytes(b"separated")

    super_res_out = pdir / "super_resolution" / "upscaled.wav"
    super_res_out.parent.mkdir(parents=True, exist_ok=True)
    super_res_out.write_bytes(b"upscaled")

    master_out = pdir / "master" / "mastered.wav"
    master_out.parent.mkdir(parents=True, exist_ok=True)
    master_out.write_bytes(b"mastered")

    mock_denoise.return_value = {"output_path": str(denoise_out)}
    mock_separate.return_value = {"output_path": str(separate_out), "stems": {}}
    mock_super_res.return_value = {"output_path": str(super_res_out)}
    mock_master.return_value = {"output_path": str(master_out)}

    result = run_pipeline.apply(
        args=[tid],
        kwargs={"stages": ["denoise", "separate", "super_resolution", "master"]},
    ).get()

    assert result["status"] == "complete"
    assert len(result["stages"]) == 4
    for stage_name in ["denoise", "separate", "super_resolution", "master"]:
        assert result["stages"][stage_name]["status"] == "complete"

    # Verify chaining: each stage received the previous stage's output as input
    # denoise gets original
    denoise_input = mock_denoise.call_args[0][0]
    assert str(denoise_input).endswith(f"{tid}.wav")

    # separate gets denoise output
    separate_input = mock_separate.call_args[0][0]
    assert str(separate_input) == str(denoise_out)

    # super_resolution gets separate output
    super_res_input = mock_super_res.call_args[0][0]
    assert str(super_res_input) == str(separate_out)

    # master gets super_resolution output + original as reference
    master_input = mock_master.call_args[0][0]
    master_ref = mock_master.call_args[0][1]
    assert str(master_input) == str(super_res_out)
    assert str(master_ref).endswith(f"{tid}.wav")

    # Verify final output path
    assert result["final_output"] == str(master_out)


@patch("app.tasks.pipeline.r")
@patch("app.tasks.pipeline._run_master")
@patch("app.tasks.pipeline._run_denoise")
def test_run_pipeline_partial_stages_chain(
    mock_denoise, mock_master, mock_redis, fake_track
):
    """Running only denoise + master still chains correctly (skip separate and super_res)."""
    tid = fake_track["track_id"]
    pdir = fake_track["pipeline_dir"] / tid

    denoise_out = pdir / "denoise" / "denoised.wav"
    denoise_out.parent.mkdir(parents=True, exist_ok=True)
    denoise_out.write_bytes(b"denoised")

    master_out = pdir / "master" / "mastered.wav"
    master_out.parent.mkdir(parents=True, exist_ok=True)
    master_out.write_bytes(b"mastered")

    mock_denoise.return_value = {"output_path": str(denoise_out)}
    mock_master.return_value = {"output_path": str(master_out)}

    result = run_pipeline.apply(
        args=[tid],
        kwargs={"stages": ["denoise", "master"]},
    ).get()

    assert result["status"] == "complete"
    assert len(result["stages"]) == 2

    # master receives denoise output, not original
    master_input = mock_master.call_args[0][0]
    assert str(master_input) == str(denoise_out)


@patch("app.tasks.pipeline.r")
@patch("app.tasks.pipeline._run_super_resolution")
@patch("app.tasks.pipeline._run_separate")
@patch("app.tasks.pipeline._run_denoise")
def test_run_pipeline_mid_chain_failure(
    mock_denoise, mock_separate, mock_super_res, mock_redis, fake_track
):
    """When separate fails mid-chain, denoise results are saved and super_res is not called."""
    tid = fake_track["track_id"]
    pdir = fake_track["pipeline_dir"] / tid

    denoise_out = pdir / "denoise" / "denoised.wav"
    denoise_out.parent.mkdir(parents=True, exist_ok=True)
    denoise_out.write_bytes(b"denoised")

    mock_denoise.return_value = {"output_path": str(denoise_out)}
    mock_separate.side_effect = RuntimeError("Separation OOM")

    with pytest.raises(RuntimeError, match="Separation OOM"):
        run_pipeline.apply(
            args=[tid],
            kwargs={"stages": ["denoise", "separate", "super_resolution"]},
        ).get()

    results_path = pdir / "pipeline_results.json"
    loaded = json.loads(results_path.read_text())
    assert loaded["status"] == "failed"
    assert loaded["stages"]["denoise"]["status"] == "complete"
    assert loaded["stages"]["separate"]["status"] == "failed"
    assert "super_resolution" not in loaded["stages"]
    mock_super_res.assert_not_called()


@patch("app.tasks.pipeline.r")
@patch("app.tasks.pipeline._run_denoise")
def test_broadcast_uses_correct_status_values(mock_denoise, mock_redis, fake_track):
    """Verify broadcasts use frontend-compatible status values: processing, complete, error."""
    denoise_out = fake_track["pipeline_dir"] / fake_track["track_id"] / "d.wav"
    denoise_out.parent.mkdir(parents=True, exist_ok=True)
    denoise_out.write_bytes(b"x")
    mock_denoise.return_value = {"output_path": str(denoise_out)}

    run_pipeline.apply(
        args=[fake_track["track_id"]],
        kwargs={"stages": ["denoise"]},
    ).get()

    # Collect all broadcast calls
    statuses = []
    for call in mock_redis.publish.call_args_list:
        payload = json.loads(call[0][1])
        statuses.append(payload["status"])

    # Should only contain frontend-compatible values
    allowed = {"processing", "complete"}
    assert all(s in allowed for s in statuses), f"Unexpected statuses: {statuses}"
