# Phase 2: Enhancement Pipeline - Implementation Plan

**Goal:** Add the audio enhancement pipeline: denoise (DeepFilterNet), stem separation (Demucs), super-resolution (FlashSR), mastering (Matchering). Each stage runs as a Celery task with WebSocket progress. Pipeline panel UI with model selectors and A/B comparison.

**Architecture:** Each pipeline stage is a Celery task. Intermediate results saved to data/enhanced/{track_id}/{stage}/. WebSocket broadcasts progress per stage. Frontend Pipeline panel shows stages with progress rings and model dropdowns.

**Tech Stack Additions:** demucs, deepfilternet, FlashSR (ONNX), matchering, pyloudnorm, pedalboard

**Prerequisites:**
- Phase 1 complete (all tests passing)
- Redis running on localhost:6379
- `PYTHONPATH=""` for all Python commands
- `source ~/.nvm/nvm.sh && nvm use default` before node commands

---

## Task 1: Install Enhancement Dependencies

**Files:**
- Modify: `backend/requirements.txt`

**Step 1: Add new dependencies**

Add to backend/requirements.txt:
```
demucs==4.0.1
deepfilternet==0.5.6
matchering==2.0.6
pyloudnorm==0.1.1
pedalboard==0.9.16
onnxruntime==1.21.1
torch>=2.0.0
torchaudio>=2.0.0
```

Note: FlashSR will be installed from git in a later step after we verify it works.

**Step 2: Install deps**

```bash
cd /home/oneknight/toolkit/musictool
source backend/.venv/bin/activate
pip install demucs deepfilternet matchering pyloudnorm pedalboard onnxruntime
```

**Step 3: Verify imports**

```bash
PYTHONPATH="" .venv/bin/python -c "
import demucs; print('demucs OK')
import df; print('deepfilternet OK')
import matchering; print('matchering OK')
import pyloudnorm; print('pyloudnorm OK')
import pedalboard; print('pedalboard OK')
import onnxruntime; print('onnxruntime OK')
"
```

**Step 4: Commit**

```bash
git add backend/requirements.txt
git commit -m "deps: add enhancement pipeline packages (demucs, deepfilternet, matchering, etc)"
```

---

## Task 2: Pipeline Data Model + Config

**Files:**
- Modify: `backend/app/config.py`
- Create: `backend/app/models.py`

**Step 1: Update config.py**

Add pipeline directories and model configs:
```python
PIPELINE_DIR = DATA_DIR / "enhanced"
PIPELINE_DIR.mkdir(parents=True, exist_ok=True)

# Pipeline stage configs
PIPELINE_STAGES = ["denoise", "separate", "super_resolution", "master"]

DENOISE_MODELS = {"deepfilternet": "DeepFilterNet3"}
SEPARATION_MODELS = {"htdemucs": "htdemucs", "htdemucs_ft": "htdemucs_ft"}
SR_MODELS = {"flashsr": "FlashSR (ONNX)"}
MASTER_MODELS = {"matchering": "Matchering"}
```

**Step 2: Create models.py**

```python
# backend/app/models.py
from enum import Enum
from dataclasses import dataclass, field
from typing import Optional

class StageStatus(str, Enum):
    IDLE = "idle"
    PROCESSING = "processing"
    COMPLETE = "complete"
    ERROR = "error"

@dataclass
class PipelineJob:
    track_id: str
    stages: dict = field(default_factory=dict)
    current_stage: Optional[str] = None
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "track_id": self.track_id,
            "stages": self.stages,
            "current_stage": self.current_stage,
            "error": self.error,
        }
```

**Step 3: Commit**

```bash
git add backend/app/config.py backend/app/models.py
git commit -m "feat: pipeline data model and stage configuration"
```

---

## Task 3: DeepFilterNet Denoise Service

**Files:**
- Create: `backend/app/services/denoise.py`
- Test: `backend/tests/test_denoise.py`

**Step 1: Write failing test**

```python
# backend/tests/test_denoise.py
import pytest
from pathlib import Path
from app.services.denoise import denoise_track
from app.config import UPLOAD_DIR, PIPELINE_DIR

def get_sample_file():
    mp3s = list(UPLOAD_DIR.glob("*.mp3"))
    if not mp3s:
        pytest.skip("No MP3 files in data/uploads")
    return mp3s[0]

def test_denoise_produces_output():
    path = get_sample_file()
    track_id = "test_denoise"
    output = denoise_track(path, track_id)
    assert output.exists()
    assert output.suffix == ".wav"
    assert output.stat().st_size > 0

def test_denoise_output_in_pipeline_dir():
    path = get_sample_file()
    track_id = "test_denoise2"
    output = denoise_track(path, track_id)
    assert str(PIPELINE_DIR) in str(output)

def test_denoise_cleanup(tmp_path):
    """Ensure we can clean up test outputs."""
    path = get_sample_file()
    track_id = "test_cleanup"
    output = denoise_track(path, track_id)
    output.unlink(missing_ok=True)
    output.parent.rmdir()
```

**Step 2: Write denoise.py**

```python
# backend/app/services/denoise.py
import subprocess
import shutil
from pathlib import Path
from app.config import PIPELINE_DIR

def denoise_track(input_path: Path, track_id: str, model: str = "deepfilternet") -> Path:
    output_dir = PIPELINE_DIR / track_id / "denoise"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "denoised.wav"

    # Convert to wav first if needed (DeepFilterNet needs wav)
    import soundfile as sf
    import librosa
    y, sr = librosa.load(str(input_path), sr=None, mono=False)
    temp_wav = output_dir / "input.wav"
    sf.write(str(temp_wav), y.T if y.ndim > 1 else y, sr)

    # Run DeepFilterNet
    from df.enhance import enhance, init_df
    model_df, df_state, _ = init_df()
    import torch
    import torchaudio
    audio, sr_df = torchaudio.load(str(temp_wav))
    enhanced = enhance(model_df, df_state, audio)
    torchaudio.save(str(output_path), enhanced, sr_df)

    # Cleanup temp
    temp_wav.unlink(missing_ok=True)

    return output_path
```

Note: The exact DeepFilterNet API may need adjustment based on the installed version. Research the current API before implementing.

**Step 3: Run tests, fix, commit**

```bash
cd /home/oneknight/toolkit/musictool/backend
PYTHONPATH="" .venv/bin/python -m pytest tests/test_denoise.py -v
```

```bash
git add backend/app/services/denoise.py backend/tests/test_denoise.py
git commit -m "feat: DeepFilterNet noise reduction service"
```

---

## Task 4: Demucs Stem Separation Service

**Files:**
- Create: `backend/app/services/separation.py`
- Test: `backend/tests/test_separation.py`

**Step 1: Write failing test**

```python
# backend/tests/test_separation.py
import pytest
from pathlib import Path
from app.services.separation import separate_stems
from app.config import UPLOAD_DIR

def get_sample_file():
    mp3s = list(UPLOAD_DIR.glob("*.mp3"))
    if not mp3s:
        pytest.skip("No MP3 files")
    return mp3s[0]

def test_separate_produces_stems():
    path = get_sample_file()
    stems = separate_stems(path, "test_sep")
    assert isinstance(stems, dict)
    assert "vocals" in stems
    assert "drums" in stems
    assert "bass" in stems
    assert "other" in stems
    for stem_path in stems.values():
        assert Path(stem_path).exists()
        assert Path(stem_path).stat().st_size > 0

def test_separate_output_is_wav():
    path = get_sample_file()
    stems = separate_stems(path, "test_sep_wav")
    for stem_path in stems.values():
        assert Path(stem_path).suffix == ".wav"
```

**Step 2: Write separation.py**

```python
# backend/app/services/separation.py
from pathlib import Path
from app.config import PIPELINE_DIR

def separate_stems(
    input_path: Path,
    track_id: str,
    model: str = "htdemucs",
    progress_callback=None,
) -> dict[str, str]:
    output_dir = PIPELINE_DIR / track_id / "stems"
    output_dir.mkdir(parents=True, exist_ok=True)

    import demucs.api
    separator = demucs.api.Separator(model=model, device="cpu")

    if progress_callback:
        progress_callback(0.1, "Loading model")

    origin, separated = separator.separate_audio_file(str(input_path))

    if progress_callback:
        progress_callback(0.9, "Saving stems")

    import torchaudio
    stems = {}
    for stem_name, stem_audio in separated.items():
        stem_path = output_dir / f"{stem_name}.wav"
        torchaudio.save(str(stem_path), stem_audio, separator.samplerate)
        stems[stem_name] = str(stem_path)

    if progress_callback:
        progress_callback(1.0, "Complete")

    return stems
```

Note: Verify demucs.api is the correct import path for the installed version.

**Step 3: Run tests (these will be slow - ~2 min), commit**

```bash
PYTHONPATH="" .venv/bin/python -m pytest tests/test_separation.py -v --timeout=300
```

```bash
git add backend/app/services/separation.py backend/tests/test_separation.py
git commit -m "feat: Demucs stem separation service (htdemucs on CPU)"
```

---

## Task 5: FlashSR Super-Resolution Service

**Files:**
- Create: `backend/app/services/super_resolution.py`
- Test: `backend/tests/test_super_resolution.py`

**Step 1: Install FlashSR**

```bash
pip install git+https://github.com/ysharma3501/FlashSR.git
```

If pip install fails, clone and use directly.

**Step 2: Write failing test**

```python
# backend/tests/test_super_resolution.py
import pytest
import soundfile as sf
from pathlib import Path
from app.services.super_resolution import upscale_audio
from app.config import UPLOAD_DIR

def get_sample_file():
    mp3s = list(UPLOAD_DIR.glob("*.mp3"))
    if not mp3s:
        pytest.skip("No MP3 files")
    return mp3s[0]

def test_upscale_produces_output():
    path = get_sample_file()
    output = upscale_audio(path, "test_sr")
    assert output.exists()
    assert output.stat().st_size > 0

def test_upscale_increases_sample_rate():
    path = get_sample_file()
    output = upscale_audio(path, "test_sr_rate")
    info = sf.info(str(output))
    assert info.samplerate >= 44100
```

**Step 3: Write super_resolution.py**

Research FlashSR API from the GitHub repo before implementing. The key pattern is:
- Load ONNX model (500KB)
- Resample input to 16kHz if needed
- Run single-step inference
- Output at 48kHz

```python
# backend/app/services/super_resolution.py
from pathlib import Path
from app.config import PIPELINE_DIR

def upscale_audio(input_path: Path, track_id: str, model: str = "flashsr") -> Path:
    output_dir = PIPELINE_DIR / track_id / "super_resolution"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "upscaled.wav"

    # Implementation depends on FlashSR API
    # Core pattern: load ONNX model, resample to 16kHz, run inference, save at 48kHz
    # Research the actual API before implementing

    return output_path
```

**Step 4: Run tests, commit**

```bash
git add backend/app/services/super_resolution.py backend/tests/test_super_resolution.py
git commit -m "feat: FlashSR super-resolution service (ONNX, CPU)"
```

---

## Task 6: Matchering Mastering Service

**Files:**
- Create: `backend/app/services/mastering.py`
- Test: `backend/tests/test_mastering.py`

**Step 1: Write failing test**

```python
# backend/tests/test_mastering.py
import pytest
import soundfile as sf
from pathlib import Path
from app.services.mastering import master_track
from app.config import UPLOAD_DIR

def get_sample_files():
    mp3s = list(UPLOAD_DIR.glob("*.mp3"))
    if len(mp3s) < 2:
        pytest.skip("Need at least 2 MP3 files")
    return mp3s[0], mp3s[1]

def test_master_produces_output():
    target, reference = get_sample_files()
    output = master_track(target, reference, "test_master")
    assert output.exists()
    assert output.suffix in (".wav", ".flac")
    assert output.stat().st_size > 0

def test_master_preserves_duration():
    target, reference = get_sample_files()
    output = master_track(target, reference, "test_master_dur")
    target_info = sf.info(str(target))
    output_info = sf.info(str(output))
    assert abs(target_info.duration - output_info.duration) < 1.0
```

**Step 2: Write mastering.py**

```python
# backend/app/services/mastering.py
import matchering as mg
from pathlib import Path
from app.config import PIPELINE_DIR

def master_track(
    target_path: Path,
    reference_path: Path,
    track_id: str,
) -> Path:
    output_dir = PIPELINE_DIR / track_id / "master"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "mastered.wav"

    mg.process(
        target=str(target_path),
        reference=str(reference_path),
        results=[
            mg.Result(str(output_path), subtype="PCM_24"),
        ],
    )

    return output_path
```

**Step 3: Run tests, commit**

```bash
git add backend/app/services/mastering.py backend/tests/test_mastering.py
git commit -m "feat: Matchering automated mastering service"
```

---

## Task 7: Pipeline Orchestrator Celery Task

**Files:**
- Create: `backend/app/tasks/pipeline.py`
- Test: `backend/tests/test_pipeline_task.py`
- Modify: `backend/app/tasks/celery_app.py` (register autodiscover)

**Step 1: Write pipeline task**

This is the orchestrator that runs all stages in sequence, broadcasts progress via Redis pub/sub (picked up by WebSocket), and saves intermediate results.

```python
# backend/app/tasks/pipeline.py
from celery import shared_task
from pathlib import Path
from app.config import UPLOAD_DIR, PIPELINE_DIR
from app.services.denoise import denoise_track
from app.services.separation import separate_stems
from app.services.super_resolution import upscale_audio
from app.services.mastering import master_track
import json
import redis

r = redis.Redis()

def _broadcast(track_id: str, stage: str, status: str, progress: float, message: str = ""):
    r.publish("pipeline_progress", json.dumps({
        "type": "progress",
        "track_id": track_id,
        "stage": stage,
        "status": status,
        "progress": progress,
        "message": message,
    }))

@shared_task(bind=True)
def run_pipeline(self, track_id: str, stages: list[str] | None = None, models: dict | None = None):
    if stages is None:
        stages = ["denoise", "separate", "super_resolution", "master"]
    if models is None:
        models = {}

    # Find the track's audio file
    meta_path = UPLOAD_DIR / ".meta" / f"{track_id}.json"
    meta = json.loads(meta_path.read_text())
    input_path = UPLOAD_DIR / meta["file_path"]

    results = {"track_id": track_id, "stages": {}}
    current_input = input_path

    for stage in stages:
        _broadcast(track_id, stage, "processing", 0.0, f"Starting {stage}")
        try:
            if stage == "denoise":
                output = denoise_track(current_input, track_id)
                current_input = output
            elif stage == "separate":
                stems = separate_stems(current_input, track_id, progress_callback=lambda p, m: _broadcast(track_id, stage, "processing", p, m))
                results["stages"]["separate"] = {"stems": stems}
                # Use 'other' stem as main output for next stage, or remix
                current_input = Path(stems.get("other", stems.get("vocals", list(stems.values())[0])))
            elif stage == "super_resolution":
                output = upscale_audio(current_input, track_id)
                current_input = output
            elif stage == "master":
                # Use original as reference for mastering
                output = master_track(current_input, input_path, track_id)
                current_input = output

            results["stages"][stage] = {"status": "complete", "output": str(current_input)}
            _broadcast(track_id, stage, "complete", 1.0, f"{stage} complete")

        except Exception as e:
            results["stages"][stage] = {"status": "error", "error": str(e)}
            _broadcast(track_id, stage, "error", 0.0, str(e))
            break

    # Save pipeline results metadata
    results_path = PIPELINE_DIR / track_id / "pipeline_results.json"
    results_path.parent.mkdir(parents=True, exist_ok=True)
    results_path.write_text(json.dumps(results, indent=2))

    return results
```

**Step 2: Update celery_app.py to autodiscover tasks**

```python
celery_app.autodiscover_tasks(["app.tasks"])
```

**Step 3: Write test**

```python
# backend/tests/test_pipeline_task.py
import pytest
from app.tasks.pipeline import run_pipeline
from app.config import UPLOAD_DIR

def test_pipeline_runs_denoise_only():
    meta_dir = UPLOAD_DIR / ".meta"
    metas = list(meta_dir.glob("*.json")) if meta_dir.exists() else []
    if not metas:
        pytest.skip("No uploaded tracks with metadata")
    import json
    meta = json.loads(metas[0].read_text())
    result = run_pipeline.apply(args=[meta["id"]], kwargs={"stages": ["denoise"]})
    data = result.get(timeout=120)
    assert data["stages"]["denoise"]["status"] == "complete"
```

**Step 4: Commit**

```bash
git add backend/app/tasks/pipeline.py backend/app/tasks/celery_app.py backend/tests/test_pipeline_task.py
git commit -m "feat: pipeline orchestrator Celery task with stage-by-stage processing"
```

---

## Task 8: WebSocket Pipeline Progress (Redis Pub/Sub)

**Files:**
- Modify: `backend/app/routes/ws.py`
- Test: `backend/tests/test_ws.py` (extend)

**Step 1: Update ws.py to subscribe to Redis pub/sub**

Add a background task that subscribes to the `pipeline_progress` Redis channel and broadcasts to connected WebSocket clients.

```python
# Add Redis pub/sub listener that forwards to WebSocket clients
import asyncio
import redis.asyncio as aioredis

async def redis_listener():
    r = aioredis.Redis()
    pubsub = r.pubsub()
    await pubsub.subscribe("pipeline_progress")
    async for message in pubsub.listen():
        if message["type"] == "message":
            data = json.loads(message["data"])
            await broadcast(data)

# Start listener as background task on app startup
```

Wire this into main.py's lifespan or startup event.

**Step 2: Commit**

```bash
git add backend/app/routes/ws.py backend/app/main.py
git commit -m "feat: WebSocket forwards pipeline progress from Redis pub/sub"
```

---

## Task 9: Pipeline API Route

**Files:**
- Create: `backend/app/routes/pipeline.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_pipeline_api.py`

**Step 1: Write pipeline API**

```python
# backend/app/routes/pipeline.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.tasks.pipeline import run_pipeline
from app.config import PIPELINE_DIR
import json

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])

class PipelineRequest(BaseModel):
    track_id: str
    stages: list[str] | None = None
    models: dict | None = None

@router.post("/run")
async def start_pipeline(req: PipelineRequest):
    task = run_pipeline.delay(req.track_id, req.stages, req.models)
    return {"task_id": task.id, "track_id": req.track_id}

@router.get("/status/{track_id}")
async def pipeline_status(track_id: str):
    results_path = PIPELINE_DIR / track_id / "pipeline_results.json"
    if not results_path.exists():
        raise HTTPException(status_code=404, detail="No pipeline results")
    return json.loads(results_path.read_text())
```

**Step 2: Register in main.py, test, commit**

```bash
git add backend/app/routes/pipeline.py backend/app/main.py backend/tests/test_pipeline_api.py
git commit -m "feat: pipeline API with run and status endpoints"
```

---

## Task 10: Frontend Pipeline Panel UI

**Files:**
- Create: `frontend/src/components/pipeline/PipelinePanel.tsx`
- Create: `frontend/src/components/pipeline/StageCard.tsx`
- Modify: `frontend/src/App.tsx`

**Step 1: Create StageCard** - shows stage name, model dropdown, progress ring, status

**Step 2: Create PipelinePanel** - lists all stages, "Enhance" button triggers POST /api/pipeline/run

**Step 3: Wire into App.tsx** - replace pipeline placeholder with PipelinePanel

**Step 4: Build, commit**

```bash
git add frontend/src/
git commit -m "feat: pipeline panel UI with stage cards, model selectors, progress"
```

---

## Task 11: Frontend Pipeline API Integration

**Files:**
- Modify: `frontend/src/hooks/useApi.ts`
- Modify: `frontend/src/hooks/useWebSocket.ts`
- Modify: `frontend/src/stores/pipeline.ts`

**Step 1: Add pipeline API functions to useApi.ts**

```typescript
export async function runPipeline(trackId: string, stages?: string[]) { ... }
export async function getPipelineStatus(trackId: string) { ... }
```

**Step 2: Update WebSocket hook to handle pipeline progress messages**

**Step 3: Build, commit**

```bash
git add frontend/src/
git commit -m "feat: frontend pipeline API integration with WebSocket progress"
```

---

## Task 12: A/B Comparison + Enhanced Audio Playback

**Files:**
- Modify: `frontend/src/hooks/useAudioPlayer.ts`
- Modify: `frontend/src/components/visualizer/WaveformView.tsx`
- Modify: `frontend/src/stores/playback.ts`

**Step 1: Update playback to load enhanced audio when A/B toggled**

When abMode is "processed", load from /audio/enhanced/{track_id}/... instead of /audio/uploads/...

**Step 2: Build, commit**

```bash
git add frontend/src/
git commit -m "feat: A/B toggle switches between original and enhanced audio"
```

---

## Task 13: E2E Pipeline Tests

**Files:**
- Modify: `frontend/e2e/foundation.spec.ts` or create `frontend/e2e/pipeline.spec.ts`

**Step 1: Add E2E tests for pipeline flow**

- Upload track, click Enhance, verify progress updates appear, verify enhanced audio loads

**Step 2: Run all tests (backend + frontend + E2E)**

**Step 3: Commit**

```bash
git add frontend/e2e/
git commit -m "test: E2E tests for enhancement pipeline flow"
```

---

## Task 14: Integration Smoke Test

Run full stack, upload Nebula track, run pipeline, verify each stage produces output, A/B compare, verify all tests pass.

```bash
git commit -m "phase 2 complete: enhancement pipeline with denoise, separation, super-res, mastering"
```

---

## Summary

Phase 2 delivers:
- DeepFilterNet noise reduction (real-time on CPU)
- Demucs v4 stem separation (4 stems, ~1-2 min per minute of audio)
- FlashSR super-resolution (16kHz->48kHz, near-instant)
- Matchering automated mastering (reference-based, seconds)
- Pipeline orchestrator with Celery tasks and WebSocket progress
- Pipeline panel UI with model selectors and progress rings
- A/B comparison between original and enhanced audio
- Full test coverage
