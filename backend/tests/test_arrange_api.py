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
    arr = {
        "id": "arr_test",
        "tracks": ["t1", "t2"],
        "crossfades": [{"from": "t1", "to": "t2", "duration_s": 5.0, "type": "equal_power"}],
        "total_duration_s": 355.0,
    }
    (setup_tracks["arr_dir"] / "arr_test.json").write_text(json.dumps(arr))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with patch("app.tasks.mix_render.render_mix_task") as mock_task:
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
async def test_mix_status_pending(setup_tracks):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/mix/status/nonexistent")
    # mix status returns pending, not 404
    assert res.status_code == 200
    assert res.json()["status"] == "pending"
