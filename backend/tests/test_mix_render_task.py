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
    assert mock_redis.publish.call_count >= 2


@patch("app.tasks.mix_render.r")
def test_render_mix_task_missing_arrangement(mock_redis, mix_env):
    with pytest.raises(ValueError, match="not found"):
        render_mix_task.apply(
            kwargs={"arrangement_id": "nonexistent"}
        ).get()


@patch("app.tasks.mix_render.r")
def test_render_loop_task_produces_output(mock_redis, mix_env):
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
