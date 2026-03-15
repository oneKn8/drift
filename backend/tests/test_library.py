import pytest
from pathlib import Path
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.config import UPLOAD_DIR


@pytest.fixture(autouse=True)
def cleanup():
    before = set(UPLOAD_DIR.glob("*"))
    meta_before = set((UPLOAD_DIR / ".meta").glob("*.json")) if (UPLOAD_DIR / ".meta").exists() else set()
    yield
    after = set(UPLOAD_DIR.glob("*"))
    for f in after - before:
        if f.is_file():
            f.unlink(missing_ok=True)
    if (UPLOAD_DIR / ".meta").exists():
        meta_after = set((UPLOAD_DIR / ".meta").glob("*.json"))
        for f in meta_after - meta_before:
            f.unlink(missing_ok=True)


def get_test_mp3():
    source_dir = Path(__file__).resolve().parent.parent.parent
    mp3s = list(source_dir.glob("*.mp3"))
    if not mp3s:
        mp3s = list(UPLOAD_DIR.glob("*.mp3"))
    if not mp3s:
        pytest.skip("No MP3 files found for testing")
    return mp3s[0]


@pytest.mark.asyncio
async def test_list_tracks_empty_or_populated():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/library")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_upload_track():
    mp3 = get_test_mp3()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with open(mp3, "rb") as f:
            response = await client.post(
                "/api/library/upload",
                files={"file": ("test_track.mp3", f, "audio/mpeg")},
            )
    assert response.status_code == 200
    data = response.json()
    assert data["filename"] == "test_track.mp3"
    assert "id" in data
    assert "bpm" in data
    assert "key" in data
    assert "duration" in data
    assert "energy" in data


@pytest.mark.asyncio
async def test_upload_rejects_non_audio():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/library/upload",
            files={"file": ("evil.exe", b"not audio", "application/octet-stream")},
        )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_get_track_by_id():
    mp3 = get_test_mp3()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with open(mp3, "rb") as f:
            upload_resp = await client.post(
                "/api/library/upload",
                files={"file": ("get_test.mp3", f, "audio/mpeg")},
            )
        track_id = upload_resp.json()["id"]
        response = await client.get(f"/api/library/{track_id}")
    assert response.status_code == 200
    assert response.json()["id"] == track_id


@pytest.mark.asyncio
async def test_delete_track():
    mp3 = get_test_mp3()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with open(mp3, "rb") as f:
            upload_resp = await client.post(
                "/api/library/upload",
                files={"file": ("delete_test.mp3", f, "audio/mpeg")},
            )
        track_id = upload_resp.json()["id"]
        del_resp = await client.delete(f"/api/library/{track_id}")
    assert del_resp.status_code == 200
