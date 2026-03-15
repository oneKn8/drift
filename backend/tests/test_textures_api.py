"""Tests for textures API."""

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest.fixture
def texture_dir(tmp_path, monkeypatch):
    tex_dir = tmp_path / "textures"
    tex_dir.mkdir()
    monkeypatch.setattr("app.routes.textures.TEXTURES_DIR", tex_dir)
    return tex_dir


@pytest.mark.asyncio
async def test_list_textures_empty(texture_dir):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/textures")
    assert res.status_code == 200
    assert res.json()["textures"] == []


@pytest.mark.asyncio
async def test_list_textures_with_files(texture_dir):
    (texture_dir / "rain.mp3").write_bytes(b"fake")
    (texture_dir / "wind.wav").write_bytes(b"fake")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/textures")
    data = res.json()
    assert len(data["textures"]) == 2
    names = [t["name"] for t in data["textures"]]
    assert "rain.mp3" in names


@pytest.mark.asyncio
async def test_list_textures_ignores_non_audio(texture_dir):
    (texture_dir / "readme.txt").write_bytes(b"not audio")
    (texture_dir / "rain.mp3").write_bytes(b"fake")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/textures")
    data = res.json()
    assert len(data["textures"]) == 1
    assert data["textures"][0]["name"] == "rain.mp3"
