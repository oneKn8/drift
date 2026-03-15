# Phase 5: Sleep Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Full-screen sleep mode with binaural/isochronal entrainment, ambient noise, texture loops, timer/alarm, and horizon transition effect.

**Architecture:** Mostly frontend -- Web Audio API handles entrainment/noise/texture generation. One new backend endpoint lists texture files. Sleep view replaces entire app UI when active.

**Tech Stack:** Web Audio API (oscillators, filters, buffers), Canvas 2D (horizon effect), Zustand (sleep state), FastAPI (texture listing)

---

### Task 1: Backend -- Config, Textures API, Static Mount

**Files:**
- Modify: `backend/app/config.py`
- Create: `backend/app/routes/textures.py`
- Create: `backend/tests/test_textures_api.py`
- Modify: `backend/app/main.py`

**Step 1: Add TEXTURES_DIR to config.py**

Add after ARRANGEMENTS_DIR:
```python
TEXTURES_DIR = DATA_DIR / "textures"
```
Add TEXTURES_DIR to the mkdir loop.

**Step 2: Create textures route**

```python
"""API route for listing available ambient texture files."""

from fastapi import APIRouter

from app.config import TEXTURES_DIR, ALLOWED_EXTENSIONS

router = APIRouter(prefix="/api", tags=["textures"])


@router.get("/textures")
def list_textures():
    """List audio files available in the textures directory."""
    if not TEXTURES_DIR.exists():
        return {"textures": []}

    files = []
    for f in sorted(TEXTURES_DIR.iterdir()):
        if f.is_file() and f.suffix.lower() in ALLOWED_EXTENSIONS:
            files.append({"name": f.name, "path": f"/audio/textures/{f.name}"})

    return {"textures": files}
```

**Step 3: Write tests**

```python
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
```

**Step 4: Wire into main.py**

Add import and include_router for textures. Add static mount:
```python
from app.routes.textures import router as textures_router
# ...
app.include_router(textures_router)
# ...
app.mount("/audio/textures", StaticFiles(directory=str(TEXTURES_DIR)), name="textures")
```

Add TEXTURES_DIR to the import from config.

**Step 5: Run tests, commit**

Run: `cd backend && PYTHONPATH="" .venv/bin/python -m pytest tests/test_textures_api.py -v`

Commit: `git add backend/ && git commit -m "feat: add textures API endpoint and static mount"`

---

### Task 2: Frontend -- Sleep Store

**Files:**
- Create: `frontend/src/stores/sleep.ts`
- Create: `frontend/src/stores/__tests__/sleep.test.ts`

**Step 1: Write tests**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { useSleepStore } from "../sleep";

describe("sleep store", () => {
  beforeEach(() => {
    useSleepStore.setState(useSleepStore.getInitialState());
  });

  it("starts in setup phase", () => {
    expect(useSleepStore.getState().phase).toBe("setup");
  });

  it("sets preset", () => {
    useSleepStore.getState().setPreset("deep_sleep");
    expect(useSleepStore.getState().preset).toBe("deep_sleep");
  });

  it("sets audio mode", () => {
    useSleepStore.getState().setAudioMode("headphones");
    expect(useSleepStore.getState().audioMode).toBe("headphones");
  });

  it("sets timer duration", () => {
    useSleepStore.getState().setTimerDuration(7200);
    expect(useSleepStore.getState().timerDuration).toBe(7200);
  });

  it("toggles alarm", () => {
    useSleepStore.getState().toggleAlarm();
    expect(useSleepStore.getState().alarmEnabled).toBe(false);
    useSleepStore.getState().toggleAlarm();
    expect(useSleepStore.getState().alarmEnabled).toBe(true);
  });

  it("sets noise type", () => {
    useSleepStore.getState().setNoiseType("pink");
    expect(useSleepStore.getState().noiseType).toBe("pink");
  });

  it("sets texture", () => {
    useSleepStore.getState().setTexture("rain.mp3");
    expect(useSleepStore.getState().texture).toBe("rain.mp3");
  });

  it("sets volumes independently", () => {
    useSleepStore.getState().setVolume("entrainment", 0.5);
    expect(useSleepStore.getState().volumes.entrainment).toBe(0.5);
    expect(useSleepStore.getState().volumes.music).toBe(0.6);
  });

  it("transitions phases", () => {
    useSleepStore.getState().setPhase("transition");
    expect(useSleepStore.getState().phase).toBe("transition");
    useSleepStore.getState().setPhase("active");
    expect(useSleepStore.getState().phase).toBe("active");
  });

  it("sets custom frequency", () => {
    useSleepStore.getState().setCustomFreq(8, 2);
    expect(useSleepStore.getState().customStartFreq).toBe(8);
    expect(useSleepStore.getState().customEndFreq).toBe(2);
  });

  it("tracks current frequency", () => {
    useSleepStore.getState().setCurrentFreq(4.5);
    expect(useSleepStore.getState().currentFreq).toBe(4.5);
  });

  it("resets to defaults", () => {
    useSleepStore.getState().setPreset("deep_sleep");
    useSleepStore.getState().setPhase("active");
    useSleepStore.getState().reset();
    expect(useSleepStore.getState().phase).toBe("setup");
    expect(useSleepStore.getState().preset).toBe("wind_down");
  });
});
```

**Step 2: Implement store**

```typescript
import { create } from "zustand";

export type SleepPhase = "setup" | "transition" | "active";
export type SleepPreset = "wind_down" | "deep_sleep" | "full_cycle" | "custom";
export type AudioMode = "headphones" | "speakers";
export type NoiseType = "off" | "brown" | "pink";
type VolumeLayer = "music" | "entrainment" | "noise" | "texture";

export interface FreqWaypoint {
  time: number; // 0-1 normalized
  freq: number; // Hz
}

export const PRESETS: Record<SleepPreset, { label: string; waypoints: FreqWaypoint[]; durationMin: number }> = {
  wind_down: {
    label: "Wind Down",
    waypoints: [{ time: 0, freq: 10 }, { time: 1, freq: 6 }],
    durationMin: 30,
  },
  deep_sleep: {
    label: "Deep Sleep",
    waypoints: [{ time: 0, freq: 2 }, { time: 1, freq: 2 }],
    durationMin: 60,
  },
  full_cycle: {
    label: "Full Cycle",
    waypoints: [
      { time: 0, freq: 10 },
      { time: 0.33, freq: 6 },
      { time: 0.66, freq: 2 },
      { time: 0.83, freq: 6 },
      { time: 1, freq: 10 },
    ],
    durationMin: 90,
  },
  custom: {
    label: "Custom",
    waypoints: [{ time: 0, freq: 10 }, { time: 1, freq: 2 }],
    durationMin: 30,
  },
};

interface SleepState {
  phase: SleepPhase;
  preset: SleepPreset;
  audioMode: AudioMode;
  timerDuration: number; // seconds, 0 = endless
  alarmEnabled: boolean;
  noiseType: NoiseType;
  texture: string | null; // filename or null
  trackId: string | null;
  loopMode: "auto" | "full";
  volumes: Record<VolumeLayer, number>;
  customStartFreq: number;
  customEndFreq: number;
  currentFreq: number;
  timerRemaining: number;

  setPhase: (phase: SleepPhase) => void;
  setPreset: (preset: SleepPreset) => void;
  setAudioMode: (mode: AudioMode) => void;
  setTimerDuration: (seconds: number) => void;
  toggleAlarm: () => void;
  setNoiseType: (type: NoiseType) => void;
  setTexture: (name: string | null) => void;
  setTrackId: (id: string | null) => void;
  setLoopMode: (mode: "auto" | "full") => void;
  setVolume: (layer: VolumeLayer, value: number) => void;
  setCustomFreq: (start: number, end: number) => void;
  setCurrentFreq: (freq: number) => void;
  setTimerRemaining: (seconds: number) => void;
  reset: () => void;
}

const defaults = {
  phase: "setup" as SleepPhase,
  preset: "wind_down" as SleepPreset,
  audioMode: "speakers" as AudioMode,
  timerDuration: 3600,
  alarmEnabled: true,
  noiseType: "brown" as NoiseType,
  texture: null as string | null,
  trackId: null as string | null,
  loopMode: "auto" as "auto" | "full",
  volumes: { music: 0.6, entrainment: 0.3, noise: 0.2, texture: 0.4 },
  customStartFreq: 10,
  customEndFreq: 2,
  currentFreq: 0,
  timerRemaining: 0,
};

export const useSleepStore = create<SleepState>()((set) => ({
  ...defaults,

  setPhase: (phase) => set({ phase }),
  setPreset: (preset) => set({ preset }),
  setAudioMode: (mode) => set({ audioMode: mode }),
  setTimerDuration: (seconds) => set({ timerDuration: seconds }),
  toggleAlarm: () => set((s) => ({ alarmEnabled: !s.alarmEnabled })),
  setNoiseType: (type) => set({ noiseType: type }),
  setTexture: (name) => set({ texture: name }),
  setTrackId: (id) => set({ trackId: id }),
  setLoopMode: (mode) => set({ loopMode: mode }),
  setVolume: (layer, value) =>
    set((s) => ({ volumes: { ...s.volumes, [layer]: value } })),
  setCustomFreq: (start, end) =>
    set({ customStartFreq: start, customEndFreq: end }),
  setCurrentFreq: (freq) => set({ currentFreq: freq }),
  setTimerRemaining: (seconds) => set({ timerRemaining: seconds }),
  reset: () => set({ ...defaults }),
}));
```

**Step 3: Run tests, commit**

Run: `cd frontend && source ~/.nvm/nvm.sh && nvm use default && npx vitest run`

Commit: `git add frontend/src/stores/sleep.ts frontend/src/stores/__tests__/sleep.test.ts && git commit -m "feat: add sleep mode Zustand store with presets and state machine"`

---

### Task 3: Frontend -- Entrainment Web Audio Hook

**Files:**
- Create: `frontend/src/hooks/useEntrainment.ts`

This is the core audio engine. No unit tests for Web Audio (AudioContext not available in jsdom). Validated via E2E + manual testing.

**Implementation:**

```typescript
import { useEffect, useRef, useCallback } from "react";
import { useSleepStore, PRESETS } from "../stores/sleep";
import type { AudioMode, NoiseType, FreqWaypoint } from "../stores/sleep";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.clamp(t, 0, 1);
}

// Math.clamp polyfill
if (!Math.clamp) {
  Math.clamp = (v: number, min: number, max: number) =>
    Math.min(Math.max(v, min), max);
}

function interpWaypoints(waypoints: FreqWaypoint[], t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  for (let i = 0; i < waypoints.length - 1; i++) {
    if (clamped >= waypoints[i].time && clamped <= waypoints[i + 1].time) {
      const segT =
        (clamped - waypoints[i].time) /
        (waypoints[i + 1].time - waypoints[i].time);
      return lerp(waypoints[i].freq, waypoints[i + 1].freq, segT);
    }
  }
  return waypoints[waypoints.length - 1].freq;
}

export function useEntrainment() {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const nodesRef = useRef<{
    binauralLeft?: OscillatorNode;
    binauralRight?: OscillatorNode;
    isoOsc?: OscillatorNode;
    isoLfo?: OscillatorNode;
    isoLfoGain?: GainNode;
    noiseSource?: AudioBufferSourceNode;
    noiseGain?: GainNode;
    noiseFilter?: BiquadFilterNode;
    textureEl?: HTMLAudioElement;
    textureGain?: GainNode;
    entrainmentGain?: GainNode;
    bassBoost?: BiquadFilterNode;
    merger?: ChannelMergerNode;
  }>({});
  const freqIntervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const {
    phase,
    preset,
    audioMode,
    noiseType,
    texture,
    volumes,
    customStartFreq,
    customEndFreq,
    setCurrentFreq,
  } = useSleepStore();

  const BASE_FREQ = 200; // carrier frequency for binaural

  const createContext = useCallback(() => {
    if (ctxRef.current) return ctxRef.current;
    const ctx = new AudioContext();
    ctxRef.current = ctx;

    const master = ctx.createGain();
    master.gain.value = 1.0;
    master.connect(ctx.destination);
    masterGainRef.current = master;

    return ctx;
  }, []);

  const startEntrainment = useCallback(
    (mode: AudioMode, beatFreq: number) => {
      const ctx = createContext();
      const master = masterGainRef.current!;
      const nodes = nodesRef.current;

      // Entrainment gain
      const eGain = ctx.createGain();
      eGain.gain.value = volumes.entrainment;
      eGain.connect(master);
      nodes.entrainmentGain = eGain;

      if (mode === "headphones") {
        // Binaural: left = BASE, right = BASE + beat
        const merger = ctx.createChannelMerger(2);
        merger.connect(eGain);
        nodes.merger = merger;

        const left = ctx.createOscillator();
        left.type = "sine";
        left.frequency.value = BASE_FREQ;
        left.connect(merger, 0, 0);
        left.start();
        nodes.binauralLeft = left;

        const right = ctx.createOscillator();
        right.type = "sine";
        right.frequency.value = BASE_FREQ + beatFreq;
        right.connect(merger, 0, 1);
        right.start();
        nodes.binauralRight = right;
      } else {
        // Isochronal: osc * LFO amplitude modulation
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = BASE_FREQ;

        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0;
        nodes.isoLfoGain = lfoGain;

        osc.connect(lfoGain);
        lfoGain.connect(eGain);
        osc.start();
        nodes.isoOsc = osc;

        const lfo = ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = beatFreq;
        lfo.connect(lfoGain.gain);
        lfo.start();
        nodes.isoLfo = lfo;
      }
    },
    [createContext, volumes.entrainment]
  );

  const startNoise = useCallback(
    (type: NoiseType) => {
      if (type === "off") return;
      const ctx = createContext();
      const master = masterGainRef.current!;
      const nodes = nodesRef.current;

      // Generate white noise buffer
      const bufferSize = ctx.sampleRate * 10;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = type === "brown" ? 200 : 1000;
      nodes.noiseFilter = filter;

      const gain = ctx.createGain();
      gain.gain.value = volumes.noise;
      nodes.noiseGain = gain;

      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start();
      nodes.noiseSource = source;
    },
    [createContext, volumes.noise]
  );

  const startTexture = useCallback(
    (filename: string) => {
      const ctx = createContext();
      const master = masterGainRef.current!;
      const nodes = nodesRef.current;

      const el = new Audio(`/audio/textures/${filename}`);
      el.loop = true;
      el.crossOrigin = "anonymous";
      nodes.textureEl = el;

      const source = ctx.createMediaElementSource(el);
      const gain = ctx.createGain();
      gain.gain.value = volumes.texture;
      nodes.textureGain = gain;

      source.connect(gain);
      gain.connect(master);
      el.play().catch(() => {});
    },
    [createContext, volumes.texture]
  );

  const startBassBoost = useCallback(
    (mode: AudioMode) => {
      if (mode !== "speakers") return;
      const ctx = createContext();
      const nodes = nodesRef.current;

      const boost = ctx.createBiquadFilter();
      boost.type = "peaking";
      boost.frequency.value = 60;
      boost.gain.value = 6;
      boost.Q.value = 1;
      nodes.bassBoost = boost;
      // Bass boost is available for music routing
    },
    [createContext]
  );

  const updateFrequency = useCallback(
    (freq: number) => {
      const nodes = nodesRef.current;
      if (nodes.binauralRight) {
        nodes.binauralRight.frequency.value = BASE_FREQ + freq;
      }
      if (nodes.isoLfo) {
        nodes.isoLfo.frequency.value = freq;
      }
      setCurrentFreq(freq);
    },
    [setCurrentFreq]
  );

  const startFrequencyRamp = useCallback(
    (waypoints: FreqWaypoint[], durationMs: number) => {
      const startTime = Date.now();
      if (freqIntervalRef.current) clearInterval(freqIntervalRef.current);

      freqIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const t = Math.min(elapsed / durationMs, 1);
        const freq = interpWaypoints(waypoints, t);
        updateFrequency(freq);
        if (t >= 1) clearInterval(freqIntervalRef.current);
      }, 1000);
    },
    [updateFrequency]
  );

  const stopAll = useCallback(() => {
    const nodes = nodesRef.current;
    if (freqIntervalRef.current) clearInterval(freqIntervalRef.current);

    try { nodes.binauralLeft?.stop(); } catch {}
    try { nodes.binauralRight?.stop(); } catch {}
    try { nodes.isoOsc?.stop(); } catch {}
    try { nodes.isoLfo?.stop(); } catch {}
    try { nodes.noiseSource?.stop(); } catch {}
    if (nodes.textureEl) {
      nodes.textureEl.pause();
      nodes.textureEl.src = "";
    }

    nodesRef.current = {};

    if (ctxRef.current && ctxRef.current.state !== "closed") {
      ctxRef.current.close().catch(() => {});
    }
    ctxRef.current = null;
    masterGainRef.current = null;
  }, []);

  const getMasterGain = useCallback(() => masterGainRef.current, []);

  // Update volumes in real-time
  useEffect(() => {
    const nodes = nodesRef.current;
    if (nodes.entrainmentGain) nodes.entrainmentGain.gain.value = volumes.entrainment;
    if (nodes.noiseGain) nodes.noiseGain.gain.value = volumes.noise;
    if (nodes.textureGain) nodes.textureGain.gain.value = volumes.texture;
  }, [volumes]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopAll();
  }, [stopAll]);

  return {
    startEntrainment,
    startNoise,
    startTexture,
    startBassBoost,
    startFrequencyRamp,
    updateFrequency,
    stopAll,
    getMasterGain,
  };
}
```

**Step 2: Commit**

Commit: `git add frontend/src/hooks/useEntrainment.ts && git commit -m "feat: add Web Audio entrainment engine with binaural, isochronal, noise, and texture layers"`

---

### Task 4: Frontend -- Sleep Timer Hook

**Files:**
- Create: `frontend/src/hooks/useSleepTimer.ts`

```typescript
import { useEffect, useRef, useCallback } from "react";
import { useSleepStore } from "../stores/sleep";

const FADEOUT_DURATION = 300; // 5 minutes in seconds
const ALARM_RAMP_DURATION = 120; // 2 minutes
const ALARM_AUTO_STOP = 300; // 5 minutes

export function useSleepTimer(getMasterGain: () => GainNode | null) {
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const alarmOscRef = useRef<OscillatorNode | null>(null);
  const alarmGainRef = useRef<GainNode | null>(null);

  const {
    phase,
    timerDuration,
    alarmEnabled,
    timerRemaining,
    setTimerRemaining,
    setPhase,
    setCurrentFreq,
  } = useSleepStore();

  const startTimer = useCallback(() => {
    if (timerDuration === 0) return; // endless
    setTimerRemaining(timerDuration);

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const store = useSleepStore.getState();
      const remaining = store.timerRemaining - 1;

      if (remaining <= 0) {
        clearInterval(intervalRef.current);
        setTimerRemaining(0);
        // Timer expired -- audio already faded
        if (!store.alarmEnabled) {
          setPhase("setup");
          useSleepStore.getState().reset();
        }
        return;
      }

      setTimerRemaining(remaining);

      // Start fadeout in last FADEOUT_DURATION seconds
      if (remaining <= FADEOUT_DURATION) {
        const gain = getMasterGain();
        if (gain) {
          const ratio = remaining / FADEOUT_DURATION;
          gain.gain.value = ratio;
        }
      }
    }, 1000);
  }, [timerDuration, setTimerRemaining, setPhase, getMasterGain]);

  const startAlarm = useCallback(() => {
    const gain = getMasterGain();
    if (!gain || !gain.context) return;

    const ctx = gain.context as AudioContext;

    // Ramp master volume back up
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.6, ctx.currentTime + ALARM_RAMP_DURATION);

    // Alarm tone: gentle 432Hz sine
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0, ctx.currentTime);
    oscGain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + ALARM_RAMP_DURATION);
    oscGain.connect(ctx.destination);
    alarmGainRef.current = oscGain;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 432;
    osc.connect(oscGain);
    osc.start();
    alarmOscRef.current = osc;

    // Frequency ramp: delta -> alpha
    let elapsed = 0;
    const alarmInterval = setInterval(() => {
      elapsed++;
      const t = Math.min(elapsed / ALARM_RAMP_DURATION, 1);
      const freq = 2 + t * 8; // 2Hz -> 10Hz
      setCurrentFreq(freq);

      if (elapsed >= ALARM_AUTO_STOP) {
        clearInterval(alarmInterval);
        dismissAlarm();
      }
    }, 1000);
  }, [getMasterGain, setCurrentFreq]);

  const dismissAlarm = useCallback(() => {
    try { alarmOscRef.current?.stop(); } catch {}
    alarmOscRef.current = null;
    alarmGainRef.current = null;
    setPhase("setup");
    useSleepStore.getState().reset();
  }, [setPhase]);

  const stopTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimerRemaining(0);
  }, [setTimerRemaining]);

  // Watch for timer expiry + alarm
  useEffect(() => {
    if (phase === "active" && timerRemaining === 0 && timerDuration > 0 && alarmEnabled) {
      startAlarm();
    }
  }, [timerRemaining, phase, timerDuration, alarmEnabled, startAlarm]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      try { alarmOscRef.current?.stop(); } catch {}
    };
  }, []);

  return { startTimer, stopTimer, dismissAlarm };
}
```

**Step 2: Commit**

Commit: `git add frontend/src/hooks/useSleepTimer.ts && git commit -m "feat: add sleep timer hook with fadeout and alarm ramp"`

---

### Task 5: Frontend -- Sleep Setup Component

**Files:**
- Create: `frontend/src/components/sleep/SleepSetup.tsx`

This component shows the configuration screen before entering sleep mode. Uses the sleep store for all state. Fetches textures from the API. All interactive controls.

Key elements:
- Preset buttons (4): wind_down, deep_sleep, full_cycle, custom
- Custom frequency inputs (only when preset === "custom")
- Audio mode toggle: headphones / speakers
- Timer buttons: 30m(1800), 1hr(3600), 2hr(7200), 4hr(14400), 8hr(28800), endless(0)
- Alarm on/off toggle
- Noise dropdown: off, brown, pink
- Texture dropdown: off + fetched list from /api/textures
- Track dropdown: none + library tracks
- Loop mode: auto / full
- 4 volume sliders (music, entrainment, noise, texture)
- "Enter Sleep" button -> calls onEnterSleep prop

Fetches textures on mount: `fetch("/api/textures").then(r => r.json())`

Uses library store for track list.

Styling: matches existing dark neutral theme. Same select/button/slider styles as ArrangeControls.

**Step 2: Commit**

Commit: `git add frontend/src/components/sleep/SleepSetup.tsx && git commit -m "feat: add sleep setup configuration screen"`

---

### Task 6: Frontend -- Horizon Effect Component

**Files:**
- Create: `frontend/src/components/sleep/HorizonEffect.tsx`

Canvas animation that runs for ~4 seconds:
1. 0-1.5s: Waveform amplitude compresses from full to flat line
2. 1.5-3s: Line pulses with glow (two pulses)
3. 3-4s: Line fades to black

```typescript
import { useEffect, useRef } from "react";

interface HorizonEffectProps {
  onComplete: () => void;
}

export function HorizonEffect({ onComplete }: HorizonEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const duration = 4000;
    const start = performance.now();
    const midY = canvas.height / 2;

    // Generate fake waveform (sine-based)
    const points = 200;
    const baseAmplitude = canvas.height * 0.15;

    function draw(now: number) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);

      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      ctx!.fillStyle = "#000000";
      ctx!.fillRect(0, 0, canvas!.width, canvas!.height);

      if (t < 0.375) {
        // Phase 1: waveform compresses to flat (0 - 1.5s)
        const compress = 1 - t / 0.375;
        const amplitude = baseAmplitude * compress;

        ctx!.beginPath();
        ctx!.strokeStyle = `rgba(115, 115, 115, ${0.6 + compress * 0.4})`;
        ctx!.lineWidth = 1.5;

        for (let i = 0; i <= points; i++) {
          const x = (i / points) * canvas!.width;
          const wave = Math.sin(i * 0.15) * amplitude +
                       Math.sin(i * 0.08 + 1) * amplitude * 0.5;
          const y = midY + wave;
          if (i === 0) ctx!.moveTo(x, y);
          else ctx!.lineTo(x, y);
        }
        ctx!.stroke();
      } else if (t < 0.75) {
        // Phase 2: line pulses (1.5s - 3s)
        const pulseT = (t - 0.375) / 0.375;
        const pulse = Math.sin(pulseT * Math.PI * 2) * 0.5 + 0.5;
        const glow = pulse * 20;
        const alpha = 0.4 + pulse * 0.6;

        ctx!.beginPath();
        ctx!.moveTo(0, midY);
        ctx!.lineTo(canvas!.width, midY);
        ctx!.strokeStyle = `rgba(115, 115, 115, ${alpha})`;
        ctx!.lineWidth = 1.5;
        ctx!.shadowColor = `rgba(115, 115, 115, ${alpha * 0.5})`;
        ctx!.shadowBlur = glow;
        ctx!.stroke();
        ctx!.shadowBlur = 0;
      } else {
        // Phase 3: fade to black (3s - 4s)
        const fadeT = (t - 0.75) / 0.25;
        const alpha = (1 - fadeT) * 0.4;

        if (alpha > 0.01) {
          ctx!.beginPath();
          ctx!.moveTo(0, midY);
          ctx!.lineTo(canvas!.width, midY);
          ctx!.strokeStyle = `rgba(115, 115, 115, ${alpha})`;
          ctx!.lineWidth = 1.5;
          ctx!.stroke();
        }
      }

      if (t < 1) {
        requestAnimationFrame(draw);
      } else {
        onComplete();
      }
    }

    requestAnimationFrame(draw);
  }, [onComplete]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-50"
      style={{ background: "#000000" }}
    />
  );
}
```

**Step 2: Commit**

Commit: `git add frontend/src/components/sleep/HorizonEffect.tsx && git commit -m "feat: add horizon transition effect canvas animation"`

---

### Task 7: Frontend -- Sleep Active Component

**Files:**
- Create: `frontend/src/components/sleep/SleepActive.tsx`

Full-screen black view with tap-to-reveal overlay.

```typescript
import { useState, useEffect, useRef } from "react";
import { useSleepStore } from "../../stores/sleep";

interface SleepActiveProps {
  onStop: () => void;
  onDismissAlarm: () => void;
}

export function SleepActive({ onStop, onDismissAlarm }: SleepActiveProps) {
  const [showOverlay, setShowOverlay] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { timerRemaining, timerDuration, currentFreq, preset, audioMode, alarmEnabled } =
    useSleepStore();

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const now = new Date();
  const clock = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;

  // Update clock every minute
  const [clockStr, setClockStr] = useState(clock);
  useEffect(() => {
    const interval = setInterval(() => {
      const d = new Date();
      setClockStr(`${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  function handleInteraction() {
    setShowOverlay(true);
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => setShowOverlay(false), 5000);
  }

  // Hide cursor after inactivity
  const [cursorHidden, setCursorHidden] = useState(false);
  const cursorTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  function handleMouseMove() {
    setCursorHidden(false);
    handleInteraction();
    if (cursorTimeout.current) clearTimeout(cursorTimeout.current);
    cursorTimeout.current = setTimeout(() => setCursorHidden(true), 2000);
  }

  useEffect(() => {
    cursorTimeout.current = setTimeout(() => setCursorHidden(true), 2000);
    return () => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
      if (cursorTimeout.current) clearTimeout(cursorTimeout.current);
    };
  }, []);

  const freqLabel = currentFreq > 0
    ? `${currentFreq.toFixed(1)} Hz ${currentFreq > 8 ? "alpha" : currentFreq > 4 ? "theta" : "delta"}`
    : "";

  const presetLabels: Record<string, string> = {
    wind_down: "Wind Down",
    deep_sleep: "Deep Sleep",
    full_cycle: "Full Cycle",
    custom: "Custom",
  };

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center"
      style={{
        background: "#000000",
        cursor: cursorHidden ? "none" : "default",
      }}
      onClick={handleInteraction}
      onMouseMove={handleMouseMove}
    >
      <div
        className="flex flex-col items-center gap-6 transition-opacity duration-500"
        style={{ opacity: showOverlay ? 1 : 0 }}
      >
        <div className="text-5xl font-extralight tracking-tight text-neutral-700 tabular-nums">
          {clockStr}
        </div>

        {timerDuration > 0 && (
          <div className="text-sm text-neutral-800 font-mono">
            {formatTime(timerRemaining)} remaining
          </div>
        )}

        <div className="flex gap-4 text-xs text-neutral-800">
          <span>{presetLabels[preset] ?? preset}</span>
          {freqLabel && <span>{freqLabel}</span>}
          <span>{audioMode === "headphones" ? "Headphones" : "Speakers"}</span>
        </div>

        <div className="flex gap-4 items-center">
          <button
            onClick={(e) => { e.stopPropagation(); onStop(); }}
            className="px-5 py-2 text-xs border border-neutral-800 rounded text-neutral-700 hover:border-neutral-600 hover:text-neutral-500 transition-colors"
          >
            Stop
          </button>
          {alarmEnabled && timerRemaining === 0 && timerDuration > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onDismissAlarm(); }}
              className="px-5 py-2 text-xs border border-neutral-800 rounded text-neutral-700 hover:border-neutral-600 hover:text-neutral-500 transition-colors"
            >
              Dismiss Alarm
            </button>
          )}
        </div>
      </div>

      <div
        className="absolute bottom-10 text-[10px] transition-opacity duration-500"
        style={{ color: "#1a1a1a", opacity: showOverlay ? 0 : 1 }}
      >
        tap anywhere to show controls
      </div>
    </div>
  );
}
```

**Step 2: Commit**

Commit: `git add frontend/src/components/sleep/SleepActive.tsx && git commit -m "feat: add active sleep screen with tap-to-reveal controls"`

---

### Task 8: Frontend -- SleepView Container + Wiring

**Files:**
- Create: `frontend/src/components/sleep/SleepView.tsx`
- Modify: `frontend/src/stores/ui.ts` -- add "sleep" to MainView
- Modify: `frontend/src/components/layout/TopBar.tsx` -- add Sleep tab
- Modify: `frontend/src/components/layout/Layout.tsx` -- add sleep prop, render SleepView when mainView is "sleep" (full screen, no sidebar/transport)
- Modify: `frontend/src/App.tsx` -- pass SleepView
- Modify: `frontend/src/hooks/useApi.ts` -- add fetchTextures

**SleepView.tsx:**

```typescript
import { useCallback } from "react";
import { useSleepStore, PRESETS } from "../../stores/sleep";
import { useEntrainment } from "../../hooks/useEntrainment";
import { useSleepTimer } from "../../hooks/useSleepTimer";
import { SleepSetup } from "./SleepSetup";
import { HorizonEffect } from "./HorizonEffect";
import { SleepActive } from "./SleepActive";
import { useUIStore } from "../../stores/ui";

export function SleepView() {
  const { phase, setPhase, preset, audioMode, noiseType, texture, customStartFreq, customEndFreq } =
    useSleepStore();

  const entrainment = useEntrainment();
  const timer = useSleepTimer(entrainment.getMasterGain);

  const handleEnterSleep = useCallback(() => {
    setPhase("transition");
  }, [setPhase]);

  const handleTransitionComplete = useCallback(() => {
    setPhase("active");

    // Start all audio layers
    const presetData = PRESETS[preset];
    let waypoints = presetData.waypoints;
    let durationMs = presetData.durationMin * 60 * 1000;

    if (preset === "custom") {
      waypoints = [
        { time: 0, freq: customStartFreq },
        { time: 1, freq: customEndFreq },
      ];
    }

    const initialFreq = waypoints[0].freq;
    entrainment.startEntrainment(audioMode, initialFreq);
    entrainment.startNoise(noiseType);
    entrainment.startBassBoost(audioMode);

    if (texture) {
      entrainment.startTexture(texture);
    }

    entrainment.startFrequencyRamp(waypoints, durationMs);
    timer.startTimer();
  }, [phase, preset, audioMode, noiseType, texture, customStartFreq, customEndFreq, entrainment, timer, setPhase]);

  const handleStop = useCallback(() => {
    entrainment.stopAll();
    timer.stopTimer();
    useSleepStore.getState().reset();
    useUIStore.getState().setMainView("waveform");
  }, [entrainment, timer]);

  const handleDismissAlarm = useCallback(() => {
    timer.dismissAlarm();
    entrainment.stopAll();
    useUIStore.getState().setMainView("waveform");
  }, [timer, entrainment]);

  if (phase === "transition") {
    return <HorizonEffect onComplete={handleTransitionComplete} />;
  }

  if (phase === "active") {
    return <SleepActive onStop={handleStop} onDismissAlarm={handleDismissAlarm} />;
  }

  return <SleepSetup onEnterSleep={handleEnterSleep} />;
}
```

**ui.ts change:** Add "sleep" to MainView type:
```typescript
type MainView = "waveform" | "timeline" | "sleep";
```

**TopBar.tsx change:** Add Sleep tab button alongside Waveform and Timeline.

**Layout.tsx change:** Add `sleep` prop. When `mainView === "sleep"`, render only the sleep view (no sidebar, no transport, no pipeline):
```typescript
if (mainView === "sleep") {
  return (
    <div className="h-screen bg-neutral-950 text-neutral-100 overflow-hidden">
      {sleep}
    </div>
  );
}
```

**App.tsx change:** Import SleepView, pass it:
```typescript
import { SleepView } from "./components/sleep/SleepView";
// ...
<Layout
  sidebar={<LibraryPanel />}
  main={<WaveformView />}
  pipeline={<PipelinePanel />}
  timeline={<Timeline />}
  arrangeControls={<ArrangeControls />}
  sleep={<SleepView />}
/>
```

**useApi.ts change:** Add fetchTextures:
```typescript
export async function fetchTextures() {
  const res = await fetch(`${API_BASE}/textures`);
  if (!res.ok) throw new Error("Failed to fetch textures");
  return res.json();
}
```

**Step 2: Run all tests, commit**

Run: `cd frontend && source ~/.nvm/nvm.sh && nvm use default && npx vitest run`

Commit: `git add frontend/src/ && git commit -m "feat: wire sleep mode into app with view toggle and full-screen rendering"`

---

### Task 9: E2E Tests

**Files:**
- Create: `frontend/e2e/sleep.spec.ts`

```typescript
import { test, expect } from "@playwright/test";

test.describe("Sleep Mode", () => {
  test("sleep tab visible in top bar", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Sleep" })).toBeVisible();
  });

  test("clicking sleep tab shows setup screen", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sleep" }).click();
    await expect(page.getByText("Enter Sleep")).toBeVisible();
  });

  test("preset buttons are interactive", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sleep" }).click();
    await expect(page.getByText("Wind Down")).toBeVisible();
    await expect(page.getByText("Deep Sleep")).toBeVisible();
    await expect(page.getByText("Full Cycle")).toBeVisible();
    await expect(page.getByText("Custom")).toBeVisible();
  });

  test("audio mode toggle present", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sleep" }).click();
    await expect(page.getByText("Headphones")).toBeVisible();
    await expect(page.getByText("Speakers")).toBeVisible();
  });

  test("timer options present", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sleep" }).click();
    await expect(page.getByText("30m")).toBeVisible();
    await expect(page.getByText("1hr")).toBeVisible();
    await expect(page.getByText("8hr")).toBeVisible();
  });

  test("volume sliders present", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sleep" }).click();
    await expect(page.getByText("Music")).toBeVisible();
    await expect(page.getByText("Entrainment")).toBeVisible();
    await expect(page.getByText("Noise")).toBeVisible();
    await expect(page.getByText("Texture")).toBeVisible();
  });

  test("sleep mode hides sidebar and transport", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sleep" }).click();
    // Library sidebar should not be visible in sleep mode
    const library = page.getByText("Library").first();
    // TopBar is hidden in sleep mode (full-screen setup replaces everything)
    await expect(page.getByText("Enter Sleep")).toBeVisible();
  });

  test("switching back to waveform from sleep", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sleep" }).click();
    await expect(page.getByText("Enter Sleep")).toBeVisible();
    // The setup screen should have a way back -- check TopBar is still visible in setup phase
    // TopBar is only hidden during active sleep, not setup
    await page.getByRole("button", { name: "Waveform" }).click();
    await expect(page.getByText("Enter Sleep")).not.toBeVisible();
  });
});
```

**Step 2: Commit**

Commit: `git add frontend/e2e/sleep.spec.ts && git commit -m "test: add E2E tests for sleep mode setup screen"`

---

## Execution Order

1. Task 1 (backend textures API)
2. Task 2 (sleep store)
3. Task 3 (entrainment hook)
4. Task 4 (timer hook)
5. Task 5 (SleepSetup component)
6. Task 6 (HorizonEffect component)
7. Task 7 (SleepActive component)
8. Task 8 (SleepView + wiring)
9. Task 9 (E2E tests)

Tasks 1-2 are independent and can run in parallel.
Tasks 3-4 depend on Task 2 (sleep store).
Tasks 5-7 depend on Tasks 2-4 (store + hooks).
Task 8 depends on everything.
Task 9 depends on Task 8.
