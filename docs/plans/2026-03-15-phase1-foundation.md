# Phase 1: Foundation - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the backend + frontend skeleton so you can upload the 8 Nebula MP3s, see waveforms, see BPM/key/energy metadata, play tracks, and receive real-time WebSocket updates.

**Architecture:** FastAPI backend with Celery workers and Redis. Vite + React frontend with Zustand stores, WaveSurfer.js for waveforms, and WebSocket for progress. All served locally.

**Tech Stack:** Python 3.11, FastAPI, Celery, Redis, librosa, soundfile | React 19, TypeScript, Vite, Zustand, Tailwind CSS, Framer Motion, WaveSurfer.js, Playwright

**Prerequisites:**
- `source ~/.nvm/nvm.sh && nvm use default` before any node/npm commands
- Redis installed and running (`redis-server`)
- Python 3.11+ available
- All commands run from `/home/oneknight/toolkit/musictool`

---

## Task 1: Project Scaffolding

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/app/__init__.py`
- Create: `backend/tests/__init__.py`
- Create: `frontend/` (via Vite scaffold)
- Create: `data/uploads/`, `data/stems/`, `data/enhanced/`, `data/exports/`, `data/models/`, `data/rl/`
- Create: `.gitignore`
- Create: `docker-compose.yml`

**Step 1: Initialize git repo**

```bash
cd /home/oneknight/toolkit/musictool
git init
```

**Step 2: Create .gitignore**

```
# Python
__pycache__/
*.py[cod]
*.egg-info/
.eggs/
venv/
.venv/
*.egg

# Node
node_modules/
dist/

# Data
data/uploads/*
data/stems/*
data/enhanced/*
data/exports/*
data/models/*
data/rl/*
!data/*/.gitkeep

# IDE
.vscode/
.idea/

# OS
.DS_Store
*.swp

# Environment
.env
.env.local

# Research docs (not part of app)
research-*.md
docs/research/
```

**Step 3: Create backend structure**

```bash
mkdir -p backend/app/routes backend/app/services backend/app/rl backend/app/tasks backend/tests
touch backend/app/__init__.py backend/app/routes/__init__.py backend/app/services/__init__.py
touch backend/app/rl/__init__.py backend/app/tasks/__init__.py backend/tests/__init__.py
```

**Step 4: Create requirements.txt**

```
fastapi==0.115.12
uvicorn[standard]==0.34.2
python-multipart==0.0.20
websockets==15.0.1
celery[redis]==5.5.2
redis==5.3.0
librosa==0.10.2.post1
soundfile==0.13.1
numpy==1.26.4
pydub==0.25.1
pytest==8.3.5
pytest-asyncio==0.25.3
httpx==0.28.1
```

**Step 5: Create Python venv and install deps**

```bash
cd /home/oneknight/toolkit/musictool
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
```

**Step 6: Scaffold frontend with Vite**

```bash
source ~/.nvm/nvm.sh && nvm use default
cd /home/oneknight/toolkit/musictool
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install -D tailwindcss @tailwindcss/vite
npm install zustand framer-motion wavesurfer.js
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
npm install -D playwright @playwright/test
```

**Step 7: Create data directories**

```bash
mkdir -p data/{uploads,stems,enhanced,exports,models,rl}
touch data/uploads/.gitkeep data/stems/.gitkeep data/enhanced/.gitkeep
touch data/exports/.gitkeep data/models/.gitkeep data/rl/.gitkeep
```

**Step 8: Create docker-compose.yml**

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

**Step 9: Commit**

```bash
git add -A
git commit -m "scaffold: project structure with backend, frontend, and data dirs"
```

---

## Task 2: FastAPI Server Setup

**Files:**
- Create: `backend/app/main.py`
- Create: `backend/app/config.py`
- Test: `backend/tests/test_main.py`

**Step 1: Write the failing test**

```python
# backend/tests/test_main.py
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_health_check():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
```

**Step 2: Run test to verify it fails**

```bash
cd /home/oneknight/toolkit/musictool
source backend/.venv/bin/activate
cd backend
python -m pytest tests/test_main.py -v
```

Expected: FAIL (cannot import app.main)

**Step 3: Write config.py**

```python
# backend/app/config.py
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
STEMS_DIR = DATA_DIR / "stems"
ENHANCED_DIR = DATA_DIR / "enhanced"
EXPORTS_DIR = DATA_DIR / "exports"
MODELS_DIR = DATA_DIR / "models"

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".alac"}
MAX_UPLOAD_SIZE = 500 * 1024 * 1024  # 500MB

REDIS_URL = "redis://localhost:6379/0"

for d in [UPLOAD_DIR, STEMS_DIR, ENHANCED_DIR, EXPORTS_DIR, MODELS_DIR]:
    d.mkdir(parents=True, exist_ok=True)
```

**Step 4: Write main.py**

```python
# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.config import UPLOAD_DIR, ENHANCED_DIR, EXPORTS_DIR

app = FastAPI(title="Audio Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/audio/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/audio/enhanced", StaticFiles(directory=str(ENHANCED_DIR)), name="enhanced")
app.mount("/audio/exports", StaticFiles(directory=str(EXPORTS_DIR)), name="exports")


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
```

**Step 5: Run test to verify it passes**

```bash
cd /home/oneknight/toolkit/musictool/backend
python -m pytest tests/test_main.py -v
```

Expected: PASS

**Step 6: Verify server starts**

```bash
cd /home/oneknight/toolkit/musictool/backend
uvicorn app.main:app --reload --port 8000
# In another terminal: curl http://localhost:8000/api/health
# Expected: {"status":"ok"}
```

**Step 7: Commit**

```bash
git add backend/app/main.py backend/app/config.py backend/tests/test_main.py
git commit -m "feat: FastAPI server with health check and static file serving"
```

---

## Task 3: Redis + Celery Setup

**Files:**
- Create: `backend/app/tasks/celery_app.py`
- Test: `backend/tests/test_celery.py`

**Step 1: Write the failing test**

```python
# backend/tests/test_celery.py
from app.tasks.celery_app import celery_app


def test_celery_app_configured():
    assert celery_app.main == "audio_engine"
    assert "redis" in celery_app.conf.broker_url


def test_ping_task():
    from app.tasks.celery_app import ping
    result = ping.apply()
    assert result.get() == "pong"
```

**Step 2: Run test to verify it fails**

```bash
cd /home/oneknight/toolkit/musictool/backend
python -m pytest tests/test_celery.py -v
```

Expected: FAIL (cannot import celery_app)

**Step 3: Write celery_app.py**

```python
# backend/app/tasks/celery_app.py
from celery import Celery
from app.config import REDIS_URL

celery_app = Celery(
    "audio_engine",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    result_expires=3600,
)


@celery_app.task
def ping():
    return "pong"
```

**Step 4: Run test to verify it passes**

```bash
cd /home/oneknight/toolkit/musictool/backend
python -m pytest tests/test_celery.py -v
```

Expected: PASS (ping task runs eagerly in test mode)

**Step 5: Start docker-compose redis and verify Celery connects**

```bash
cd /home/oneknight/toolkit/musictool
docker compose up -d redis
cd backend
source .venv/bin/activate
celery -A app.tasks.celery_app worker --loglevel=info &
# Wait a few seconds, then:
python -c "from app.tasks.celery_app import ping; print(ping.delay().get(timeout=5))"
# Expected: pong
# Kill the worker after
```

**Step 6: Commit**

```bash
git add backend/app/tasks/celery_app.py backend/tests/test_celery.py docker-compose.yml
git commit -m "feat: Celery + Redis task queue with ping verification"
```

---

## Task 4: Audio Analysis Service

**Files:**
- Create: `backend/app/services/analysis.py`
- Test: `backend/tests/test_analysis.py`

**Step 1: Write the failing test**

```python
# backend/tests/test_analysis.py
import pytest
from pathlib import Path
from app.services.analysis import analyze_track

SAMPLE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "uploads"


def get_sample_file():
    """Find any MP3 in uploads for testing."""
    mp3s = list(SAMPLE_DIR.glob("*.mp3"))
    if not mp3s:
        pytest.skip("No MP3 files in data/uploads for testing")
    return mp3s[0]


def test_analyze_returns_required_fields():
    path = get_sample_file()
    result = analyze_track(path)
    assert "bpm" in result
    assert "key" in result
    assert "duration" in result
    assert "sample_rate" in result
    assert "channels" in result
    assert "energy" in result
    assert "waveform_peaks" in result


def test_bpm_is_reasonable():
    path = get_sample_file()
    result = analyze_track(path)
    assert 20 < result["bpm"] < 300


def test_duration_is_positive():
    path = get_sample_file()
    result = analyze_track(path)
    assert result["duration"] > 0


def test_key_is_valid():
    path = get_sample_file()
    result = analyze_track(path)
    valid_keys = [
        "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
        "Cm", "C#m", "Dm", "D#m", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "A#m", "Bm",
    ]
    assert result["key"] in valid_keys


def test_waveform_peaks_length():
    path = get_sample_file()
    result = analyze_track(path)
    # Should return a downsampled waveform for UI rendering
    assert 100 < len(result["waveform_peaks"]) < 10000


def test_energy_is_float():
    path = get_sample_file()
    result = analyze_track(path)
    assert isinstance(result["energy"], float)
    assert 0 <= result["energy"] <= 1
```

**Step 2: Run test to verify it fails**

```bash
cd /home/oneknight/toolkit/musictool/backend
python -m pytest tests/test_analysis.py -v
```

Expected: FAIL (cannot import analysis)

**Step 3: Copy test MP3s to uploads if not already there**

```bash
cp /home/oneknight/toolkit/musictool/*.mp3 /home/oneknight/toolkit/musictool/data/uploads/ 2>/dev/null || true
```

**Step 4: Write analysis.py**

```python
# backend/app/services/analysis.py
import librosa
import numpy as np
import soundfile as sf
from pathlib import Path

KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def analyze_track(path: Path) -> dict:
    path = Path(path)
    y, sr = librosa.load(str(path), sr=None, mono=True)

    info = sf.info(str(path))
    duration = info.duration
    channels = info.channels
    sample_rate = info.samplerate

    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(np.atleast_1d(tempo)[0])

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_avg = chroma.mean(axis=1)
    key_idx = int(np.argmax(chroma_avg))

    minor_profile = np.array([1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0], dtype=float)
    major_profile = np.array([1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1], dtype=float)

    major_corr = np.corrcoef(np.roll(major_profile, key_idx), chroma_avg)[0, 1]
    minor_corr = np.corrcoef(np.roll(minor_profile, key_idx), chroma_avg)[0, 1]

    key_name = KEY_NAMES[key_idx]
    if minor_corr > major_corr:
        key_name += "m"

    rms = librosa.feature.rms(y=y)[0]
    energy = float(np.mean(rms))
    energy = min(1.0, energy / 0.3)  # normalize to 0-1 range

    num_peaks = min(max(int(duration * 20), 200), 5000)
    waveform_peaks = _downsample_waveform(y, num_peaks)

    return {
        "bpm": round(bpm, 1),
        "key": key_name,
        "duration": round(duration, 2),
        "sample_rate": sample_rate,
        "channels": channels,
        "energy": round(energy, 4),
        "waveform_peaks": waveform_peaks,
    }


def _downsample_waveform(y: np.ndarray, num_points: int) -> list[float]:
    chunk_size = max(1, len(y) // num_points)
    peaks = []
    for i in range(0, len(y), chunk_size):
        chunk = y[i : i + chunk_size]
        peaks.append(float(np.max(np.abs(chunk))))
    return peaks[:num_points]
```

**Step 5: Run tests to verify they pass**

```bash
cd /home/oneknight/toolkit/musictool/backend
python -m pytest tests/test_analysis.py -v
```

Expected: All PASS

**Step 6: Commit**

```bash
git add backend/app/services/analysis.py backend/tests/test_analysis.py
git commit -m "feat: audio analysis service with BPM, key, energy, waveform extraction"
```

---

## Task 5: Library API Routes (Upload + List + Delete)

**Files:**
- Create: `backend/app/routes/library.py`
- Modify: `backend/app/main.py` (register router)
- Test: `backend/tests/test_library.py`

**Step 1: Write the failing tests**

```python
# backend/tests/test_library.py
import pytest
import shutil
from pathlib import Path
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.config import UPLOAD_DIR

TEST_UPLOAD_DIR = UPLOAD_DIR


@pytest.fixture(autouse=True)
def cleanup():
    """Track files created during test for cleanup."""
    before = set(UPLOAD_DIR.glob("*"))
    yield
    after = set(UPLOAD_DIR.glob("*"))
    for f in after - before:
        f.unlink(missing_ok=True)
    meta_dir = UPLOAD_DIR / ".meta"
    if meta_dir.exists():
        for f in meta_dir.glob("*.json"):
            if f.stat().st_mtime > 0:
                pass  # leave metadata, tests are non-destructive


def get_test_mp3():
    """Get a real MP3 file for upload testing."""
    source_dir = Path(__file__).resolve().parent.parent.parent
    mp3s = list(source_dir.glob("*.mp3"))
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
```

**Step 2: Run tests to verify they fail**

```bash
cd /home/oneknight/toolkit/musictool/backend
python -m pytest tests/test_library.py -v
```

Expected: FAIL (no routes)

**Step 3: Write library.py routes**

```python
# backend/app/routes/library.py
import json
import uuid
from pathlib import Path
from fastapi import APIRouter, UploadFile, HTTPException
from app.config import UPLOAD_DIR, ALLOWED_EXTENSIONS, MAX_UPLOAD_SIZE
from app.services.analysis import analyze_track

router = APIRouter(prefix="/api/library", tags=["library"])
META_DIR = UPLOAD_DIR / ".meta"
META_DIR.mkdir(exist_ok=True)


def _get_meta_path(track_id: str) -> Path:
    return META_DIR / f"{track_id}.json"


def _load_meta(track_id: str) -> dict | None:
    path = _get_meta_path(track_id)
    if path.exists():
        return json.loads(path.read_text())
    return None


def _save_meta(meta: dict):
    path = _get_meta_path(meta["id"])
    path.write_text(json.dumps(meta))


def _list_all_meta() -> list[dict]:
    results = []
    for f in META_DIR.glob("*.json"):
        results.append(json.loads(f.read_text()))
    return sorted(results, key=lambda x: x.get("uploaded_at", ""))


@router.get("")
async def list_tracks():
    return _list_all_meta()


@router.get("/{track_id}")
async def get_track(track_id: str):
    meta = _load_meta(track_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Track not found")
    return meta


@router.post("/upload")
async def upload_track(file: UploadFile):
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}")

    track_id = uuid.uuid4().hex[:12]
    dest = UPLOAD_DIR / f"{track_id}{ext}"

    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="File too large")

    dest.write_bytes(content)

    try:
        analysis = analyze_track(dest)
    except Exception as e:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Failed to analyze audio: {e}")

    from datetime import datetime, timezone

    meta = {
        "id": track_id,
        "filename": file.filename,
        "file_path": str(dest.relative_to(UPLOAD_DIR)),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        **analysis,
    }
    _save_meta(meta)
    return meta


@router.delete("/{track_id}")
async def delete_track(track_id: str):
    meta = _load_meta(track_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Track not found")

    audio_path = UPLOAD_DIR / meta["file_path"]
    audio_path.unlink(missing_ok=True)
    _get_meta_path(track_id).unlink(missing_ok=True)
    return {"deleted": track_id}
```

**Step 4: Register router in main.py**

Add to `backend/app/main.py` after the middleware:

```python
from app.routes.library import router as library_router
app.include_router(library_router)
```

**Step 5: Run tests to verify they pass**

```bash
cd /home/oneknight/toolkit/musictool/backend
python -m pytest tests/test_library.py -v
```

Expected: All PASS

**Step 6: Manual verification with real files**

```bash
cd /home/oneknight/toolkit/musictool/backend
uvicorn app.main:app --port 8000 &
sleep 2
# Upload a track
curl -X POST http://localhost:8000/api/library/upload \
  -F "file=@/home/oneknight/toolkit/musictool/Nebula_Drift.mp3"
# List tracks
curl http://localhost:8000/api/library | python3 -m json.tool
# Kill server
kill %1
```

**Step 7: Commit**

```bash
git add backend/app/routes/library.py backend/app/main.py backend/tests/test_library.py
git commit -m "feat: library API with upload, list, get, delete and audio analysis"
```

---

## Task 6: WebSocket Progress Endpoint

**Files:**
- Create: `backend/app/routes/ws.py`
- Modify: `backend/app/main.py` (register WS route)
- Test: `backend/tests/test_ws.py`

**Step 1: Write the failing test**

```python
# backend/tests/test_ws.py
import pytest
from httpx import AsyncClient, ASGITransport
from starlette.testclient import TestClient
from app.main import app


def test_websocket_connects():
    client = TestClient(app)
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "ping"})
        data = ws.receive_json()
        assert data["type"] == "pong"


def test_websocket_invalid_message():
    client = TestClient(app)
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "unknown_garbage"})
        data = ws.receive_json()
        assert data["type"] == "error"
```

**Step 2: Run test to verify it fails**

```bash
cd /home/oneknight/toolkit/musictool/backend
python -m pytest tests/test_ws.py -v
```

Expected: FAIL

**Step 3: Write ws.py**

```python
# backend/app/routes/ws.py
import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

# Track connected clients for broadcasting
connected_clients: set[WebSocket] = set()


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    connected_clients.add(ws)
    try:
        while True:
            data = await ws.receive_json()
            msg_type = data.get("type", "")

            if msg_type == "ping":
                await ws.send_json({"type": "pong"})
            else:
                await ws.send_json({"type": "error", "message": f"Unknown type: {msg_type}"})
    except WebSocketDisconnect:
        connected_clients.discard(ws)
    except Exception:
        connected_clients.discard(ws)


async def broadcast(message: dict):
    """Broadcast a message to all connected WebSocket clients."""
    disconnected = set()
    for ws in connected_clients:
        try:
            await ws.send_json(message)
        except Exception:
            disconnected.add(ws)
    connected_clients -= disconnected
```

**Step 4: Register in main.py**

Add to `backend/app/main.py`:

```python
from app.routes.ws import router as ws_router
app.include_router(ws_router)
```

**Step 5: Run tests to verify they pass**

```bash
cd /home/oneknight/toolkit/musictool/backend
python -m pytest tests/test_ws.py -v
```

Expected: All PASS

**Step 6: Commit**

```bash
git add backend/app/routes/ws.py backend/app/main.py backend/tests/test_ws.py
git commit -m "feat: WebSocket endpoint with ping/pong and broadcast support"
```

---

## Task 7: Frontend Setup (Vite + Tailwind + Base Config)

**Files:**
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/App.css` (replace default)
- Modify: `frontend/src/index.css`
- Modify: `frontend/tailwind.config.ts`
- Create: `frontend/vitest.config.ts`

**Step 1: Configure Tailwind**

Replace `frontend/src/index.css`:

```css
@import "tailwindcss";
```

Update `frontend/vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/ws": {
        target: "ws://localhost:8000",
        ws: true,
      },
      "/audio": "http://localhost:8000",
    },
  },
});
```

**Step 2: Configure vitest**

Create `frontend/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
```

Create `frontend/src/test-setup.ts`:

```typescript
import "@testing-library/jest-dom/vitest";
```

**Step 3: Clear default App boilerplate**

Replace `frontend/src/App.tsx`:

```tsx
function App() {
  return (
    <div className="h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <div className="flex items-center justify-center h-full">
        <p className="text-neutral-500 text-sm font-mono">audio engine</p>
      </div>
    </div>
  );
}

export default App;
```

Delete `frontend/src/App.css` if it exists.

**Step 4: Verify frontend builds and runs**

```bash
source ~/.nvm/nvm.sh && nvm use default
cd /home/oneknight/toolkit/musictool/frontend
npm run build
npm run dev &
sleep 3
curl -s http://localhost:5173 | head -20
kill %1
```

Expected: HTML output, no build errors

**Step 5: Run vitest**

```bash
cd /home/oneknight/toolkit/musictool/frontend
npx vitest run
```

Expected: passes (no tests yet, but config is valid)

**Step 6: Commit**

```bash
git add frontend/
git commit -m "feat: frontend scaffold with Vite, Tailwind, vitest config"
```

---

## Task 8: Zustand Stores

**Files:**
- Create: `frontend/src/stores/library.ts`
- Create: `frontend/src/stores/playback.ts`
- Create: `frontend/src/stores/pipeline.ts`
- Create: `frontend/src/stores/ui.ts`
- Test: `frontend/src/stores/__tests__/library.test.ts`
- Test: `frontend/src/stores/__tests__/playback.test.ts`

**Step 1: Write failing tests**

```typescript
// frontend/src/stores/__tests__/library.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useLibraryStore } from "../library";

describe("libraryStore", () => {
  beforeEach(() => {
    useLibraryStore.setState({ tracks: [], loading: false, error: null });
  });

  it("starts with empty tracks", () => {
    const state = useLibraryStore.getState();
    expect(state.tracks).toEqual([]);
    expect(state.loading).toBe(false);
  });

  it("adds a track", () => {
    const track = {
      id: "abc123",
      filename: "test.mp3",
      bpm: 120,
      key: "Am",
      duration: 180,
      energy: 0.5,
      sample_rate: 44100,
      channels: 2,
      waveform_peaks: [],
      file_path: "abc123.mp3",
      uploaded_at: "2026-03-15T00:00:00Z",
    };
    useLibraryStore.getState().addTrack(track);
    expect(useLibraryStore.getState().tracks).toHaveLength(1);
    expect(useLibraryStore.getState().tracks[0].id).toBe("abc123");
  });

  it("removes a track", () => {
    const track = {
      id: "abc123",
      filename: "test.mp3",
      bpm: 120,
      key: "Am",
      duration: 180,
      energy: 0.5,
      sample_rate: 44100,
      channels: 2,
      waveform_peaks: [],
      file_path: "abc123.mp3",
      uploaded_at: "2026-03-15T00:00:00Z",
    };
    useLibraryStore.getState().addTrack(track);
    useLibraryStore.getState().removeTrack("abc123");
    expect(useLibraryStore.getState().tracks).toHaveLength(0);
  });
});
```

```typescript
// frontend/src/stores/__tests__/playback.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { usePlaybackStore } from "../playback";

describe("playbackStore", () => {
  beforeEach(() => {
    usePlaybackStore.setState({
      isPlaying: false,
      currentTrackId: null,
      currentTime: 0,
      duration: 0,
      volume: 0.8,
      abMode: "processed",
    });
  });

  it("starts paused", () => {
    expect(usePlaybackStore.getState().isPlaying).toBe(false);
  });

  it("toggles play state", () => {
    usePlaybackStore.getState().togglePlay();
    expect(usePlaybackStore.getState().isPlaying).toBe(true);
    usePlaybackStore.getState().togglePlay();
    expect(usePlaybackStore.getState().isPlaying).toBe(false);
  });

  it("toggles A/B mode", () => {
    expect(usePlaybackStore.getState().abMode).toBe("processed");
    usePlaybackStore.getState().toggleAB();
    expect(usePlaybackStore.getState().abMode).toBe("original");
    usePlaybackStore.getState().toggleAB();
    expect(usePlaybackStore.getState().abMode).toBe("processed");
  });

  it("sets volume", () => {
    usePlaybackStore.getState().setVolume(0.5);
    expect(usePlaybackStore.getState().volume).toBe(0.5);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd /home/oneknight/toolkit/musictool/frontend
npx vitest run
```

Expected: FAIL (stores don't exist)

**Step 3: Write the stores**

```typescript
// frontend/src/stores/library.ts
import { create } from "zustand";

export interface Track {
  id: string;
  filename: string;
  file_path: string;
  uploaded_at: string;
  bpm: number;
  key: string;
  duration: number;
  sample_rate: number;
  channels: number;
  energy: number;
  waveform_peaks: number[];
}

interface LibraryState {
  tracks: Track[];
  loading: boolean;
  error: string | null;
  addTrack: (track: Track) => void;
  removeTrack: (id: string) => void;
  setTracks: (tracks: Track[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  tracks: [],
  loading: false,
  error: null,
  addTrack: (track) =>
    set((state) => ({ tracks: [...state.tracks, track] })),
  removeTrack: (id) =>
    set((state) => ({ tracks: state.tracks.filter((t) => t.id !== id) })),
  setTracks: (tracks) => set({ tracks }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
```

```typescript
// frontend/src/stores/playback.ts
import { create } from "zustand";

type ABMode = "original" | "processed";

interface PlaybackState {
  isPlaying: boolean;
  currentTrackId: string | null;
  currentTime: number;
  duration: number;
  volume: number;
  abMode: ABMode;
  togglePlay: () => void;
  play: (trackId: string) => void;
  pause: () => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  toggleAB: () => void;
}

export const usePlaybackStore = create<PlaybackState>((set) => ({
  isPlaying: false,
  currentTrackId: null,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  abMode: "processed",
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  play: (trackId) => set({ currentTrackId: trackId, isPlaying: true, currentTime: 0 }),
  pause: () => set({ isPlaying: false }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
  toggleAB: () =>
    set((state) => ({
      abMode: state.abMode === "original" ? "processed" : "original",
    })),
}));
```

```typescript
// frontend/src/stores/pipeline.ts
import { create } from "zustand";

export type ProcessingStatus = "idle" | "processing" | "complete" | "error";

interface PipelineStage {
  name: string;
  model: string;
  status: ProcessingStatus;
  progress: number;
}

interface PipelineState {
  stages: PipelineStage[];
  setStageStatus: (name: string, status: ProcessingStatus, progress?: number) => void;
  setStageModel: (name: string, model: string) => void;
  resetPipeline: () => void;
}

const defaultStages: PipelineStage[] = [
  { name: "analysis", model: "librosa", status: "idle", progress: 0 },
  { name: "separation", model: "htdemucs", status: "idle", progress: 0 },
  { name: "denoise", model: "deepfilter", status: "idle", progress: 0 },
  { name: "super_resolution", model: "flashsr", status: "idle", progress: 0 },
  { name: "mastering", model: "matchering", status: "idle", progress: 0 },
];

export const usePipelineStore = create<PipelineState>((set) => ({
  stages: [...defaultStages],
  setStageStatus: (name, status, progress) =>
    set((state) => ({
      stages: state.stages.map((s) =>
        s.name === name ? { ...s, status, progress: progress ?? s.progress } : s
      ),
    })),
  setStageModel: (name, model) =>
    set((state) => ({
      stages: state.stages.map((s) =>
        s.name === name ? { ...s, model } : s
      ),
    })),
  resetPipeline: () => set({ stages: [...defaultStages] }),
}));
```

```typescript
// frontend/src/stores/ui.ts
import { create } from "zustand";

type View = "studio" | "sleep";
type Panel = "library" | "pipeline";

interface UIState {
  view: View;
  openPanels: Set<Panel>;
  setView: (view: View) => void;
  togglePanel: (panel: Panel) => void;
}

export const useUIStore = create<UIState>((set) => ({
  view: "studio",
  openPanels: new Set<Panel>(["library"]),
  setView: (view) => set({ view }),
  togglePanel: (panel) =>
    set((state) => {
      const next = new Set(state.openPanels);
      if (next.has(panel)) {
        next.delete(panel);
      } else {
        next.add(panel);
      }
      return { openPanels: next };
    }),
}));
```

**Step 4: Run tests to verify they pass**

```bash
cd /home/oneknight/toolkit/musictool/frontend
npx vitest run
```

Expected: All PASS

**Step 5: Commit**

```bash
git add frontend/src/stores/ frontend/src/stores/__tests__/
git commit -m "feat: Zustand stores for library, playback, pipeline, and UI state"
```

---

## Task 9: Layout Shell Components

**Files:**
- Create: `frontend/src/components/layout/TopBar.tsx`
- Create: `frontend/src/components/layout/Transport.tsx`
- Create: `frontend/src/components/layout/Layout.tsx`
- Modify: `frontend/src/App.tsx`

**Step 1: Create Layout component**

```tsx
// frontend/src/components/layout/Layout.tsx
import { TopBar } from "./TopBar";
import { Transport } from "./Transport";
import { useUIStore } from "../../stores/ui";

interface LayoutProps {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  pipeline?: React.ReactNode;
}

export function Layout({ sidebar, main, pipeline }: LayoutProps) {
  const { openPanels, togglePanel } = useUIStore();
  const showLibrary = openPanels.has("library");
  const showPipeline = openPanels.has("pipeline");

  return (
    <div className="h-screen flex flex-col bg-neutral-950 text-neutral-100 overflow-hidden">
      <TopBar
        onToggleLibrary={() => togglePanel("library")}
        onTogglePipeline={() => togglePanel("pipeline")}
      />

      <div className="flex flex-1 min-h-0">
        {showLibrary && (
          <aside className="w-72 border-r border-neutral-800 flex-shrink-0 overflow-y-auto">
            {sidebar}
          </aside>
        )}

        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-0">{main}</div>

          {showPipeline && pipeline && (
            <div className="border-t border-neutral-800 h-48 flex-shrink-0 overflow-y-auto">
              {pipeline}
            </div>
          )}
        </main>
      </div>

      <Transport />
    </div>
  );
}
```

**Step 2: Create TopBar**

```tsx
// frontend/src/components/layout/TopBar.tsx
interface TopBarProps {
  onToggleLibrary: () => void;
  onTogglePipeline: () => void;
}

export function TopBar({ onToggleLibrary, onTogglePipeline }: TopBarProps) {
  return (
    <header className="h-12 border-b border-neutral-800 flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-4">
        <span className="text-sm font-semibold tracking-tight text-neutral-100">
          audio engine
        </span>
        <span className="text-xs text-neutral-600 font-mono">v0.1</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onToggleLibrary}
          className="px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 rounded transition-colors"
        >
          Library
        </button>
        <button
          onClick={onTogglePipeline}
          className="px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 rounded transition-colors"
        >
          Pipeline
        </button>
        <button className="px-3 py-1.5 text-xs font-medium bg-neutral-100 text-neutral-900 rounded hover:bg-neutral-200 transition-colors">
          Export
        </button>
      </div>
    </header>
  );
}
```

**Step 3: Create Transport**

```tsx
// frontend/src/components/layout/Transport.tsx
import { usePlaybackStore } from "../../stores/playback";

export function Transport() {
  const { isPlaying, togglePlay, volume, setVolume, abMode, toggleAB, currentTime, duration } =
    usePlaybackStore();

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="h-14 border-t border-neutral-800 flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="w-8 h-8 flex items-center justify-center rounded-full border border-neutral-700 hover:border-neutral-500 transition-colors"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <rect x="2" y="1" width="3" height="10" rx="0.5" />
              <rect x="7" y="1" width="3" height="10" rx="0.5" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M3 1.5v9l7.5-4.5z" />
            </svg>
          )}
        </button>

        <span className="text-xs font-mono text-neutral-500 w-24">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={toggleAB}
          className={`px-2 py-1 text-xs font-mono rounded transition-colors ${
            abMode === "original"
              ? "bg-neutral-800 text-neutral-300"
              : "bg-neutral-100 text-neutral-900"
          }`}
        >
          {abMode === "original" ? "A (orig)" : "B (proc)"}
        </button>

        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-500">
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.08" />
          </svg>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-20 accent-neutral-100"
          />
        </div>
      </div>
    </div>
  );
}
```

**Step 4: Update App.tsx**

```tsx
// frontend/src/App.tsx
import { Layout } from "./components/layout/Layout";

function App() {
  return (
    <Layout
      sidebar={
        <div className="p-4">
          <p className="text-xs text-neutral-500">Library</p>
        </div>
      }
      main={
        <div className="flex items-center justify-center h-full">
          <p className="text-neutral-600 text-sm font-mono">
            drop audio files here
          </p>
        </div>
      }
      pipeline={
        <div className="p-4">
          <p className="text-xs text-neutral-500">Pipeline</p>
        </div>
      }
    />
  );
}

export default App;
```

**Step 5: Verify visually**

```bash
source ~/.nvm/nvm.sh && nvm use default
cd /home/oneknight/toolkit/musictool/frontend
npm run build
```

Expected: builds without errors

**Step 6: Commit**

```bash
git add frontend/src/components/ frontend/src/App.tsx
git commit -m "feat: layout shell with TopBar, Transport, collapsible panels"
```

---

## Task 10: Library Panel (Upload + Track List)

**Files:**
- Create: `frontend/src/components/library/LibraryPanel.tsx`
- Create: `frontend/src/components/library/TrackCard.tsx`
- Create: `frontend/src/components/library/UploadZone.tsx`
- Create: `frontend/src/hooks/useApi.ts`
- Modify: `frontend/src/App.tsx`

**Step 1: Create API hook**

```typescript
// frontend/src/hooks/useApi.ts
const API_BASE = "/api";

export async function fetchTracks() {
  const res = await fetch(`${API_BASE}/library`);
  if (!res.ok) throw new Error("Failed to fetch tracks");
  return res.json();
}

export async function uploadTrack(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/library/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(err.detail);
  }
  return res.json();
}

export async function deleteTrack(id: string) {
  const res = await fetch(`${API_BASE}/library/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete track");
  return res.json();
}
```

**Step 2: Create TrackCard**

```tsx
// frontend/src/components/library/TrackCard.tsx
import type { Track } from "../../stores/library";
import { usePlaybackStore } from "../../stores/playback";

interface TrackCardProps {
  track: Track;
  onDelete: (id: string) => void;
}

export function TrackCard({ track, onDelete }: TrackCardProps) {
  const { play, currentTrackId, isPlaying } = usePlaybackStore();
  const isActive = currentTrackId === track.id;

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={`group px-3 py-2.5 border-b border-neutral-800/50 cursor-pointer transition-colors ${
        isActive ? "bg-neutral-800/50" : "hover:bg-neutral-900"
      }`}
      onClick={() => play(track.id)}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-neutral-200 truncate">{track.filename}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs font-mono text-neutral-500">
              {track.bpm} bpm
            </span>
            <span className="text-xs font-mono text-neutral-500">
              {track.key}
            </span>
            <span className="text-xs font-mono text-neutral-500">
              {formatDuration(track.duration)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <div
            className="w-1.5 h-4 rounded-full bg-neutral-700"
            style={{ opacity: track.energy }}
            title={`Energy: ${Math.round(track.energy * 100)}%`}
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(track.id);
            }}
            className="p-1 text-neutral-600 hover:text-red-400 transition-colors"
            aria-label="Delete track"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Create UploadZone**

```tsx
// frontend/src/components/library/UploadZone.tsx
import { useCallback, useState } from "react";

interface UploadZoneProps {
  onUpload: (files: File[]) => void;
  uploading: boolean;
}

export function UploadZone({ onUpload, uploading }: UploadZoneProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        /\.(mp3|wav|flac|ogg|m4a|aac)$/i.test(f.name)
      );
      if (files.length) onUpload(files);
    },
    [onUpload]
  );

  const handleClick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "audio/*";
    input.onchange = () => {
      if (input.files) onUpload(Array.from(input.files));
    };
    input.click();
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={handleClick}
      className={`mx-3 my-2 p-4 border border-dashed rounded cursor-pointer transition-colors ${
        dragOver
          ? "border-neutral-400 bg-neutral-800/30"
          : "border-neutral-800 hover:border-neutral-600"
      }`}
    >
      <p className="text-xs text-neutral-500 text-center">
        {uploading ? "uploading..." : "drop files or click"}
      </p>
    </div>
  );
}
```

**Step 4: Create LibraryPanel**

```tsx
// frontend/src/components/library/LibraryPanel.tsx
import { useEffect, useState } from "react";
import { useLibraryStore } from "../../stores/library";
import { TrackCard } from "./TrackCard";
import { UploadZone } from "./UploadZone";
import { fetchTracks, uploadTrack, deleteTrack } from "../../hooks/useApi";

export function LibraryPanel() {
  const { tracks, setTracks, addTrack, removeTrack, setLoading, loading } =
    useLibraryStore();
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchTracks()
      .then(setTracks)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [setTracks, setLoading]);

  const handleUpload = async (files: File[]) => {
    setUploading(true);
    for (const file of files) {
      try {
        const track = await uploadTrack(file);
        addTrack(track);
      } catch (err) {
        console.error("Upload failed:", err);
      }
    }
    setUploading(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTrack(id);
      removeTrack(id);
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-neutral-800">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
            Library
          </span>
          <span className="text-xs text-neutral-600 font-mono">
            {tracks.length}
          </span>
        </div>
      </div>

      <UploadZone onUpload={handleUpload} uploading={uploading} />

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="text-xs text-neutral-600 text-center py-8">loading...</p>
        ) : tracks.length === 0 ? (
          <p className="text-xs text-neutral-600 text-center py-8">no tracks</p>
        ) : (
          tracks.map((track) => (
            <TrackCard key={track.id} track={track} onDelete={handleDelete} />
          ))
        )}
      </div>
    </div>
  );
}
```

**Step 5: Update App.tsx to use LibraryPanel**

```tsx
// frontend/src/App.tsx
import { Layout } from "./components/layout/Layout";
import { LibraryPanel } from "./components/library/LibraryPanel";

function App() {
  return (
    <Layout
      sidebar={<LibraryPanel />}
      main={
        <div className="flex items-center justify-center h-full">
          <p className="text-neutral-600 text-sm font-mono">
            drop audio files here
          </p>
        </div>
      }
      pipeline={
        <div className="p-4">
          <p className="text-xs text-neutral-500">Pipeline controls</p>
        </div>
      }
    />
  );
}

export default App;
```

**Step 6: Verify builds**

```bash
source ~/.nvm/nvm.sh && nvm use default
cd /home/oneknight/toolkit/musictool/frontend
npm run build
```

Expected: no errors

**Step 7: Commit**

```bash
git add frontend/src/
git commit -m "feat: library panel with upload, track list, and delete"
```

---

## Task 11: WaveSurfer Waveform + Audio Playback

**Files:**
- Create: `frontend/src/components/visualizer/WaveformView.tsx`
- Create: `frontend/src/hooks/useAudioPlayer.ts`
- Modify: `frontend/src/App.tsx`

**Step 1: Create audio player hook**

```typescript
// frontend/src/hooks/useAudioPlayer.ts
import { useEffect, useRef, useCallback } from "react";
import WaveSurfer from "wavesurfer.js";
import { usePlaybackStore } from "../stores/playback";
import { useLibraryStore } from "../stores/library";

export function useAudioPlayer(containerRef: React.RefObject<HTMLDivElement | null>) {
  const wsRef = useRef<WaveSurfer | null>(null);
  const { isPlaying, currentTrackId, volume, setCurrentTime, setDuration, pause } =
    usePlaybackStore();
  const { tracks } = useLibraryStore();

  const currentTrack = tracks.find((t) => t.id === currentTrackId);

  // Create / destroy WaveSurfer
  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#404040",
      progressColor: "#e5e5e5",
      cursorColor: "#737373",
      cursorWidth: 1,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      height: "auto",
      normalize: true,
      backend: "WebAudio",
    });

    ws.on("timeupdate", (time) => setCurrentTime(time));
    ws.on("ready", () => setDuration(ws.getDuration()));
    ws.on("finish", () => pause());

    wsRef.current = ws;

    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  }, [containerRef, setCurrentTime, setDuration, pause]);

  // Load track when currentTrackId changes
  useEffect(() => {
    if (!wsRef.current || !currentTrack) return;
    const url = `/audio/uploads/${currentTrack.file_path}`;
    wsRef.current.load(url);
  }, [currentTrack]);

  // Play/pause sync
  useEffect(() => {
    if (!wsRef.current) return;
    if (isPlaying) {
      wsRef.current.play().catch(() => {});
    } else {
      wsRef.current.pause();
    }
  }, [isPlaying]);

  // Volume sync
  useEffect(() => {
    if (!wsRef.current) return;
    wsRef.current.setVolume(volume);
  }, [volume]);

  const seekTo = useCallback((progress: number) => {
    if (!wsRef.current) return;
    wsRef.current.seekTo(progress);
  }, []);

  return { wavesurfer: wsRef, seekTo };
}
```

**Step 2: Create WaveformView**

```tsx
// frontend/src/components/visualizer/WaveformView.tsx
import { useRef } from "react";
import { useAudioPlayer } from "../../hooks/useAudioPlayer";
import { usePlaybackStore } from "../../stores/playback";

export function WaveformView() {
  const containerRef = useRef<HTMLDivElement>(null);
  useAudioPlayer(containerRef);
  const { currentTrackId } = usePlaybackStore();

  return (
    <div className="h-full flex flex-col">
      {!currentTrackId ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-neutral-600 text-sm font-mono">
            select a track from the library
          </p>
        </div>
      ) : (
        <div className="flex-1 px-4 py-2">
          <div ref={containerRef} className="h-full" />
        </div>
      )}
    </div>
  );
}
```

**Step 3: Update App.tsx**

```tsx
// frontend/src/App.tsx
import { Layout } from "./components/layout/Layout";
import { LibraryPanel } from "./components/library/LibraryPanel";
import { WaveformView } from "./components/visualizer/WaveformView";

function App() {
  return (
    <Layout
      sidebar={<LibraryPanel />}
      main={<WaveformView />}
      pipeline={
        <div className="p-4">
          <p className="text-xs text-neutral-500">Pipeline controls</p>
        </div>
      }
    />
  );
}

export default App;
```

**Step 4: Verify builds**

```bash
source ~/.nvm/nvm.sh && nvm use default
cd /home/oneknight/toolkit/musictool/frontend
npm run build
```

Expected: no errors

**Step 5: Commit**

```bash
git add frontend/src/
git commit -m "feat: WaveSurfer waveform display with audio playback integration"
```

---

## Task 12: WebSocket Hook

**Files:**
- Create: `frontend/src/hooks/useWebSocket.ts`

**Step 1: Write the hook**

```typescript
// frontend/src/hooks/useWebSocket.ts
import { useEffect, useRef, useCallback } from "react";
import { usePipelineStore } from "../stores/pipeline";

type WSMessage = {
  type: string;
  [key: string]: unknown;
};

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout>>();
  const { setStageStatus } = usePipelineStore();

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "ping" }));
    };

    ws.onmessage = (event) => {
      const data: WSMessage = JSON.parse(event.data);

      if (data.type === "progress") {
        const { stage, status, progress } = data as {
          stage: string;
          status: string;
          progress: number;
        };
        setStageStatus(
          stage,
          status as "idle" | "processing" | "complete" | "error",
          progress
        );
      }
    };

    ws.onclose = () => {
      reconnectTimeout.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [setStageStatus]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimeout.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((message: WSMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { send };
}
```

**Step 2: Add to App.tsx**

Add `useWebSocket()` call inside the App component:

```tsx
import { useWebSocket } from "./hooks/useWebSocket";

function App() {
  useWebSocket();
  // ... rest of component
}
```

**Step 3: Verify builds**

```bash
source ~/.nvm/nvm.sh && nvm use default
cd /home/oneknight/toolkit/musictool/frontend
npm run build
```

**Step 4: Commit**

```bash
git add frontend/src/hooks/useWebSocket.ts frontend/src/App.tsx
git commit -m "feat: WebSocket hook with auto-reconnect and pipeline progress handling"
```

---

## Task 13: E2E Integration Test (Playwright)

**Files:**
- Create: `frontend/e2e/foundation.spec.ts`
- Create: `frontend/playwright.config.ts`

**Step 1: Configure Playwright**

```typescript
// frontend/playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
  },
  webServer: [
    {
      command: "cd ../backend && source .venv/bin/activate && uvicorn app.main:app --port 8000",
      port: 8000,
      timeout: 30000,
      reuseExistingServer: true,
    },
    {
      command: "npm run dev",
      port: 5173,
      timeout: 30000,
      reuseExistingServer: true,
    },
  ],
});
```

**Step 2: Write E2E tests**

```typescript
// frontend/e2e/foundation.spec.ts
import { test, expect } from "@playwright/test";
import path from "path";

const SAMPLE_MP3 = path.resolve(__dirname, "../../Nebula_Drift.mp3");

test.describe("Foundation", () => {
  test("app loads with correct layout", async ({ page }) => {
    await page.goto("/");

    // TopBar visible
    await expect(page.getByText("audio engine")).toBeVisible();
    await expect(page.getByText("v0.1")).toBeVisible();

    // Library panel visible
    await expect(page.getByText("Library")).toBeVisible();

    // Transport visible
    await expect(page.getByLabel("Play")).toBeVisible();

    // Export button visible
    await expect(page.getByText("Export")).toBeVisible();
  });

  test("library toggle works", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Library").first()).toBeVisible();

    // Click Library button in TopBar to toggle
    await page.getByRole("button", { name: "Library" }).click();

    // Library text should not be visible as panel (the button is still there)
    // The LIBRARY header inside the panel should be gone
    await expect(page.getByText("no tracks")).not.toBeVisible();
  });

  test("upload a track and see it in library", async ({ page }) => {
    await page.goto("/");

    // Upload via file input
    const fileInput = await page.locator('input[type="file"]');

    // Use the upload zone click to trigger file input
    const uploadZone = page.getByText("drop files or click");
    await expect(uploadZone).toBeVisible();

    // Set input file via page evaluation
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      uploadZone.click(),
    ]);
    await fileChooser.setFiles(SAMPLE_MP3);

    // Wait for track to appear in library
    await expect(page.getByText("Nebula_Drift.mp3")).toBeVisible({
      timeout: 30000,
    });

    // Verify metadata displayed
    await expect(page.getByText(/bpm/)).toBeVisible();
  });

  test("click track to play and see waveform", async ({ page }) => {
    await page.goto("/");

    // Upload first
    const uploadZone = page.getByText("drop files or click");
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      uploadZone.click(),
    ]);
    await fileChooser.setFiles(SAMPLE_MP3);
    await expect(page.getByText("Nebula_Drift.mp3")).toBeVisible({
      timeout: 30000,
    });

    // Click the track
    await page.getByText("Nebula_Drift.mp3").click();

    // "select a track" message should disappear
    await expect(
      page.getByText("select a track from the library")
    ).not.toBeVisible();

    // WaveSurfer container should have canvas (waveform rendered)
    await expect(page.locator("wave canvas, canvas")).toBeVisible({
      timeout: 10000,
    });
  });

  test("transport play/pause button works", async ({ page }) => {
    await page.goto("/");

    const playBtn = page.getByLabel("Play");
    await expect(playBtn).toBeVisible();

    // Click play (nothing loaded, should just toggle state)
    await playBtn.click();

    // Should now show pause button
    await expect(page.getByLabel("Pause")).toBeVisible();

    // Click again
    await page.getByLabel("Pause").click();
    await expect(page.getByLabel("Play")).toBeVisible();
  });

  test("A/B toggle switches mode", async ({ page }) => {
    await page.goto("/");

    const abBtn = page.getByText("B (proc)");
    await expect(abBtn).toBeVisible();

    await abBtn.click();
    await expect(page.getByText("A (orig)")).toBeVisible();

    await page.getByText("A (orig)").click();
    await expect(page.getByText("B (proc)")).toBeVisible();
  });

  test("volume slider changes", async ({ page }) => {
    await page.goto("/");

    const slider = page.locator('input[type="range"]');
    await expect(slider).toBeVisible();

    // Set volume to 50%
    await slider.fill("0.5");
  });

  test("pipeline panel toggles", async ({ page }) => {
    await page.goto("/");

    // Pipeline panel should be visible by default or togglable
    const pipelineBtn = page.getByRole("button", { name: "Pipeline" });
    await expect(pipelineBtn).toBeVisible();

    await pipelineBtn.click();
    // Pipeline content should toggle
  });

  test("API health check", async ({ request }) => {
    const response = await request.get("http://localhost:8000/api/health");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
  });

  test("API list tracks", async ({ request }) => {
    const response = await request.get("http://localhost:8000/api/library");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
```

**Step 3: Install Playwright browsers**

```bash
source ~/.nvm/nvm.sh && nvm use default
cd /home/oneknight/toolkit/musictool/frontend
npx playwright install chromium
```

**Step 4: Run E2E tests**

```bash
cd /home/oneknight/toolkit/musictool/frontend
npx playwright test
```

Expected: All PASS

**Step 5: Commit**

```bash
git add frontend/e2e/ frontend/playwright.config.ts
git commit -m "test: E2E tests for foundation - layout, upload, playback, controls"
```

---

## Task 14: Full Integration Smoke Test

**Description:** Start the full stack and manually verify everything works end-to-end.

**Step 1: Start all services**

```bash
# Terminal 1: Redis
cd /home/oneknight/toolkit/musictool
docker compose up -d redis

# Terminal 2: Backend
cd /home/oneknight/toolkit/musictool/backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 3: Frontend
source ~/.nvm/nvm.sh && nvm use default
cd /home/oneknight/toolkit/musictool/frontend
npm run dev
```

**Step 2: Manual verification checklist**

Open http://localhost:5173 in browser and verify:

- [ ] App loads, dark theme, TopBar shows "audio engine v0.1"
- [ ] Library panel visible on left with "Library" header
- [ ] Upload zone shows "drop files or click"
- [ ] Click upload zone, select all 8 Nebula MP3s
- [ ] All 8 tracks appear in library with BPM, key, duration
- [ ] Click a track - waveform renders in main area
- [ ] Play button works - audio plays through speakers
- [ ] Pause button works
- [ ] Volume slider adjusts volume
- [ ] A/B toggle switches between "A (orig)" and "B (proc)"
- [ ] Time display updates during playback
- [ ] Library toggle button hides/shows library panel
- [ ] Pipeline toggle button hides/shows pipeline panel
- [ ] Delete button on track removes it
- [ ] No console errors in browser DevTools
- [ ] WebSocket connects (check Network tab)

**Step 3: Run all automated tests**

```bash
# Backend tests
cd /home/oneknight/toolkit/musictool/backend
source .venv/bin/activate
python -m pytest tests/ -v

# Frontend unit tests
source ~/.nvm/nvm.sh && nvm use default
cd /home/oneknight/toolkit/musictool/frontend
npx vitest run

# E2E tests
npx playwright test
```

Expected: ALL PASS

**Step 4: Final commit**

```bash
cd /home/oneknight/toolkit/musictool
git add -A
git commit -m "phase 1 complete: foundation with upload, analysis, playback, waveforms"
```

---

## Summary

Phase 1 delivers:
- FastAPI backend with file upload, audio analysis, WebSocket
- Redis + Celery task infrastructure
- React frontend with Linear-clean dark UI
- Library panel with drag-and-drop upload
- Track metadata display (BPM, key, duration, energy)
- WaveSurfer waveform rendering
- Audio playback with play/pause, volume, A/B toggle
- WebSocket connection for real-time updates
- Full test coverage: unit, integration, E2E

After Phase 1, you can upload all 8 Nebula tracks, see their waveforms, play them, and see their musical metadata. The infrastructure is ready for Phase 2 (enhancement pipeline).
