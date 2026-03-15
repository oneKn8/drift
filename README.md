<div align="center">

<br>

# drift

**Audio post-processing engine for AI-generated music.**

Take tracks from Gemini, Suno, or any generator and transform them into<br>
audiophile-quality, endlessly looping, sleep-ready audio.

<br>

[![License: MIT](https://img.shields.io/badge/license-MIT-neutral.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-neutral.svg)](https://python.org)
[![React 19](https://img.shields.io/badge/react-19-neutral.svg)](https://react.dev)
[![Tests](https://img.shields.io/badge/tests-120%20passing-neutral.svg)](#tests)

<br>

</div>

---

Not a music generator. A creative engine for music that already exists.

Drift sits in the gap between "AI generated this" and "I'd actually listen to this all night." It denoises, upscales, masters, arranges tracks into seamless mixes, finds perfect loop points, and puts you to sleep with brainwave entrainment -- all from a local web UI, all on CPU.

## Features

- **Enhancement pipeline** -- Denoise (DeepFilterNet), stem separation (Demucs), super-resolution to 48kHz, automated mastering (Matchering). Per-stage model selection, real-time WebSocket progress.

- **Auto-arrangement** -- Order tracks by energy arc, key compatibility (Camelot wheel), and BPM proximity. Equal-power crossfades. Render to FLAC/WAV with LUFS normalization.

- **Loop detection** -- Find seamless loop points via chroma self-similarity at beat resolution. Export loops that repeat without audible seams.

- **Sleep mode** -- Binaural beats (headphones) or isochronal tones (speakers) for brainwave entrainment. Brown/pink noise. Ambient texture loops. Four presets from alpha-to-theta wind-down to full 90-minute sleep cycles. Timer with gradual fadeout. Optional alarm that sweeps you from delta back to alpha.

- **Runs locally** -- No cloud, no accounts, no telemetry. CPU-only ML inference. Your audio stays on your machine.

## How it works

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser                                                        │
│  React 19 + Zustand + WaveSurfer.js                             │
│  Web Audio API (entrainment, noise gen, playback routing)       │
│  Canvas 2D (horizon transition effect)                          │
├─────────────────────────────────────────────────────────────────┤
│  FastAPI                                                        │
│  Audio analysis (librosa) / File management / WebSocket         │
├─────────────────────────────────────────────────────────────────┤
│  Celery + Redis                                                 │
│  Enhancement pipeline / Mix rendering / Loop export             │
└─────────────────────────────────────────────────────────────────┘
```

## Quick start

> [!NOTE]
> Requires Python 3.10+, Node.js 18+, and Redis. The easiest way to run Redis is via Docker.

```bash
git clone https://github.com/oneKn8/drift.git && cd drift
```

**1. Start Redis**

```bash
docker compose up -d
```

**2. Backend**

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8001 --reload
```

**3. Celery worker** (separate terminal)

```bash
cd backend && source .venv/bin/activate
celery -A app.tasks.celery_app worker --loglevel=info --concurrency=1 -P solo
```

**4. Frontend** (separate terminal)

```bash
cd frontend
npm install
API_PORT=8001 npx vite --port 5182
```

Open [localhost:5182](http://localhost:5182)

## Enhancement pipeline

| Stage | Model | Output |
|:------|:------|:-------|
| Denoise | DeepFilterNet3 | Clean audio at 48kHz |
| Separate | Demucs HTDemucs | Vocals, drums, bass, other stems |
| Super-res | librosa DSP | Resampled to 48kHz |
| Master | Matchering | Loudness + spectral matched to reference |

Each stage is optional. Select models per stage. Progress streams via WebSocket in real time.

## Auto-arrangement

Tracks are ordered by a greedy nearest-neighbor heuristic:

| Signal | Weight | Purpose |
|:-------|:-------|:--------|
| Energy smoothness | 60% | Avoid jarring intensity jumps |
| Key compatibility | 30% | Camelot wheel harmonic mixing |
| BPM proximity | 10% | Similar tempos crossfade cleaner |

Crossfade duration scales with BPM difference (3--15s). Export as FLAC or WAV with configurable sample rate (44.1/48/96 kHz), bit depth (16/24), and LUFS target.

## Sleep mode

```
Upload tracks  -->  Configure  -->  Enter Sleep  -->  Drift off
                     |                  |
                     |                  +--> Horizon transition (4s)
                     |                  +--> Pure black screen
                     |                  +--> Tap to reveal controls
                     |
                     +--> Preset: Wind Down / Deep Sleep / Full Cycle / Custom
                     +--> Mode: Headphones (binaural) / Speakers (isochronal)
                     +--> Timer: 30m / 1hr / 2hr / 4hr / 8hr / endless
                     +--> Alarm: on/off (delta-to-alpha frequency ramp)
                     +--> Layers: music + entrainment + noise + texture
```

**Entrainment presets**

| Preset | Frequency path | Duration |
|:-------|:---------------|:---------|
| Wind Down | 10 Hz alpha --> 6 Hz theta | 30 min |
| Deep Sleep | 2 Hz delta (steady) | Continuous |
| Full Cycle | alpha --> theta --> delta --> theta --> alpha | 90 min |
| Custom | User-defined start/end Hz | User-defined |

**Audio layers** -- four independent layers mixed via Web Audio API, each with its own volume control:

1. **Music** -- your track, looped seamlessly using detected loop points
2. **Entrainment** -- binaural beats (headphone) or isochronal tones (speaker)
3. **Noise** -- procedural brown or pink noise, infinite, never repeats
4. **Texture** -- ambient loops from `data/textures/` (rain, wind, etc.)

**Speaker mode** adds a bass boost filter (peaking EQ at 60 Hz, +6 dB) for subwoofer systems.

### Textures

Drop audio files into `data/textures/` and they appear in the sleep setup:

```
data/textures/
  rain-on-tin.mp3
  wind.wav
  crickets.flac
```

## Project structure

```
drift/
  backend/
    app/
      routes/        # REST + WebSocket endpoints
      services/      # Audio processing (analysis, denoise, separation, mastering,
                     #   arrangement, loop detection, mixing)
      tasks/         # Celery tasks (pipeline, mix render)
    tests/           # 86 pytest tests
  frontend/
    src/
      components/    # React components (layout, library, pipeline, timeline, sleep)
      stores/        # Zustand stores (library, playback, pipeline, arrangement,
                     #   sleep, ui)
      hooks/         # useApi, useWebSocket, useAudioPlayer, useEntrainment,
                     #   useSleepTimer
    e2e/             # Playwright E2E tests
  data/
    uploads/         # User-uploaded tracks
    enhanced/        # Pipeline outputs (denoised, stems, mastered)
    exports/         # Rendered mixes and loops
    textures/        # Ambient texture loops for sleep mode
    arrangements/    # Saved arrangement JSON
```

## Tests

```bash
# Backend -- 86 tests
cd backend && python -m pytest tests/ --ignore=tests/test_separation.py -v

# Frontend -- 26 unit tests
cd frontend && npx vitest run

# E2E -- 22 tests (requires app running)
cd frontend && npx playwright test
```

<details>
<summary>Test coverage breakdown</summary>

| Area | Tests | Coverage |
|:-----|:------|:---------|
| Audio analysis | 6 | BPM, key, energy, waveform extraction |
| Denoise service | 3 | DeepFilterNet output validation |
| Separation service | 5 | Demucs stem splitting |
| Super-resolution | 2 | Sample rate upscaling |
| Mastering service | 2 | Matchering reference matching |
| Pipeline orchestrator | 13 | Stage chaining, failures, progress |
| Pipeline API | 5 | Endpoints, validation |
| Arrangement service | 20 | Camelot wheel, scoring, ordering |
| Loop detection | 5 | Chroma similarity, beat snapping |
| Mixer service | 8 | Crossfade math, render, export |
| Mix render task | 4 | Celery task, progress broadcast |
| Textures API | 3 | File listing, filtering |
| WebSocket | 2 | Connection, message handling |
| Frontend stores | 26 | Library, playback, arrangement, sleep |
| E2E | 22 | Upload, pipeline, timeline, sleep |

</details>

## Stack

| Layer | Technologies |
|:------|:------------|
| Frontend | React 19, TypeScript, Zustand, Tailwind CSS 4, WaveSurfer.js, Framer Motion, Web Audio API |
| Backend | Python 3.10+, FastAPI, Celery, Redis |
| Audio/ML | librosa, soundfile, torch, Demucs, DeepFilterNet, Matchering, pyloudnorm, ONNX Runtime |
| Testing | pytest, vitest, Playwright |

## Requirements

- **CPU** with AVX2 support (Intel 6th gen+ / AMD Zen+)
- **16 GB RAM** minimum, 24 GB recommended for Demucs stem separation
- **No GPU required** -- all inference runs on CPU
- **Redis** via Docker or local install
- **Python 3.10+** and **Node.js 18+**

## License

[MIT](LICENSE)
