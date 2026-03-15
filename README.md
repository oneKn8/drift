# drift

Audio post-processing engine for AI-generated music. Takes tracks from Gemini, Suno, or any generator and transforms them into audiophile-quality, endlessly looping, sleep-ready audio.

Not a music generator. A creative engine for music that already exists.

## What it does

**Enhance** -- Denoise (DeepFilterNet), separate stems (Demucs), super-resolve to 48kHz, master with reference matching (Matchering). Full pipeline with real-time progress.

**Arrange** -- Auto-order tracks by energy curve, key compatibility (Camelot wheel), and BPM proximity. Equal-power crossfades between tracks. Render to FLAC/WAV.

**Loop** -- Detect seamless loop points using chroma self-similarity at beat resolution. Export loops that repeat without audible seams.

**Sleep** -- Binaural beats (headphones) or isochronal tones (speakers) for brainwave entrainment. Brown/pink noise generation. Ambient texture loops. Presets: Wind Down (alpha to theta), Deep Sleep (delta), Full Cycle (90-min sleep cycle). Timer with gradual fadeout. Optional alarm with gentle frequency ramp from delta back to alpha.

## Architecture

```
Browser (localhost:5182)
  React 19 + Zustand + Tailwind + WaveSurfer.js
  Web Audio API (entrainment, noise, playback)
  Canvas 2D (horizon transition effect)

FastAPI (localhost:8001)
  Audio analysis (librosa), file management
  WebSocket (real-time pipeline progress)

Celery + Redis
  Enhancement pipeline (CPU-bound ML inference)
  Mix rendering, loop export
```

Everything runs locally. No cloud, no accounts, no telemetry. CPU-only inference via ONNX Runtime.

## Quick start

```bash
# Clone
git clone https://github.com/oneKn8/drift.git
cd drift

# Redis
docker compose up -d

# Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
PYTHONPATH="" uvicorn app.main:app --port 8001 --reload

# Celery worker (separate terminal)
cd backend
source .venv/bin/activate
PYTHONPATH="" celery -A app.tasks.celery_app worker --loglevel=info --concurrency=1 -P solo

# Frontend (separate terminal)
cd frontend
npm install
API_PORT=8001 npx vite --port 5182
```

Open `http://localhost:5182`

## Sleep mode

1. Upload ambient tracks
2. Click **Sleep** tab
3. Choose a preset (Wind Down, Deep Sleep, Full Cycle, or Custom)
4. Select headphones or speakers
5. Set timer and alarm preference
6. Add noise layer (brown/pink) and texture loops (rain, wind, etc.)
7. Click **Enter Sleep**

The screen transitions to pure black. Tap anywhere to reveal clock and controls. Timer fades audio out gradually. Alarm gently ramps you back to wakefulness.

### Textures

Drop ambient loops into `data/textures/` and they appear in the sleep setup dropdown:

```
data/textures/rain-on-tin.mp3
data/textures/wind.wav
data/textures/crickets.flac
```

## Enhancement pipeline

| Stage | Model | What it does |
|-------|-------|-------------|
| Denoise | DeepFilterNet3 | Remove background noise, output 48kHz |
| Separate | Demucs HTDemucs | Split into vocals, drums, bass, other stems |
| Super-res | DSP resampling | Upsample to 48kHz via librosa |
| Master | Matchering | Match loudness and spectral profile to reference |

Each stage is optional. Select models per stage. Real-time progress via WebSocket.

## Auto-arrangement

Tracks are ordered by a greedy heuristic optimizing:
- Energy smoothness (60%) -- avoid jarring intensity jumps
- Key compatibility (30%) -- Camelot wheel harmonic mixing
- BPM proximity (10%) -- similar tempos crossfade cleaner

Crossfade duration scales with BPM difference (3-15 seconds). Render the mix to FLAC or WAV with LUFS normalization.

## Tests

```bash
# Backend (86 tests)
cd backend && PYTHONPATH="" .venv/bin/python -m pytest tests/ --ignore=tests/test_separation.py -v

# Frontend unit (26 tests)
cd frontend && npx vitest run

# E2E (requires app running)
cd frontend && npx playwright test
```

## Stack

**Backend:** Python 3.10+, FastAPI, Celery, Redis, librosa, soundfile, torch, demucs, deepfilternet, matchering, pyloudnorm

**Frontend:** React 19, TypeScript, Zustand, Tailwind CSS 4, WaveSurfer.js, Framer Motion, Web Audio API

**Testing:** pytest, vitest, Playwright

## Requirements

- CPU with AVX2 (Intel 6th gen+ / AMD Zen+)
- 16GB+ RAM (24GB recommended for Demucs)
- No GPU required
- Redis (via Docker or local install)
- Node.js 18+, Python 3.10+

## License

MIT
