"""Tests for the pipeline API routes."""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def mock_lifespan():
    """Disable the Redis pipeline listener during API tests."""
    with patch("app.routes.ws.redis_pipeline_listener", return_value=None):
        yield


@pytest.mark.asyncio
async def test_pipeline_run_returns_task_id(mock_lifespan):
    """POST /api/pipeline/run should return a task_id and track_id."""
    fake_task = MagicMock()
    fake_task.id = "celery-task-id-abc123"

    with patch("app.tasks.pipeline.run_pipeline.delay", return_value=fake_task) as mock_delay:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/pipeline/run",
                json={"track_id": "track_abc123"},
            )

    assert response.status_code == 200
    data = response.json()
    assert data["task_id"] == "celery-task-id-abc123"
    assert data["track_id"] == "track_abc123"
    mock_delay.assert_called_once()


@pytest.mark.asyncio
async def test_pipeline_run_with_stages(mock_lifespan):
    """POST /api/pipeline/run with explicit stages should pass them through."""
    fake_task = MagicMock()
    fake_task.id = "celery-task-id-def456"

    with patch("app.tasks.pipeline.run_pipeline.delay", return_value=fake_task) as mock_delay:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/pipeline/run",
                json={
                    "track_id": "track_xyz",
                    "stages": ["denoise", "master"],
                },
            )

    assert response.status_code == 200
    call_kwargs = mock_delay.call_args[1]
    assert call_kwargs["stages"] == ["denoise", "master"]


@pytest.mark.asyncio
async def test_pipeline_run_invalid_stage(mock_lifespan):
    """POST /api/pipeline/run with an invalid stage should return 400."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/pipeline/run",
            json={"track_id": "track_abc", "stages": ["bogus_stage"]},
        )

    assert response.status_code == 400
    assert "Unknown pipeline stages" in response.json()["detail"]


@pytest.mark.asyncio
async def test_pipeline_status_404(mock_lifespan):
    """GET /api/pipeline/status/{track_id} for a nonexistent track should return 404."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/pipeline/status/nonexistent_track")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_pipeline_status_returns_results(mock_lifespan, tmp_path, monkeypatch):
    """GET /api/pipeline/status/{track_id} should return persisted results."""
    track_id = "track_with_results"
    results_dir = tmp_path / track_id
    results_dir.mkdir()
    results_data = {
        "track_id": track_id,
        "status": "complete",
        "stages": {"denoise": {"status": "complete"}},
    }
    results_path = results_dir / "pipeline_results.json"
    results_path.write_text(json.dumps(results_data))

    monkeypatch.setattr("app.routes.pipeline.PIPELINE_DIR", tmp_path)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(f"/api/pipeline/status/{track_id}")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "complete"
    assert data["track_id"] == track_id
