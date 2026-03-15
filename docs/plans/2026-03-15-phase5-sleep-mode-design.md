# Phase 5: Sleep Mode -- Design

Date: 2026-03-15

## Objective

Full-screen sleep mode with brainwave entrainment (binaural/isochronal), ambient noise generation, texture loops, sleep timer with optional alarm, and a horizon transition effect. The core personal use case for this project.

## Decisions

- Hybrid audio: Web Audio API for entrainment/noise, backend serves music + textures
- Manual headphone/speaker toggle (no auto-detection -- unreliable on Linux)
- Horizon transition effect only (ripple + particles deferred to Phase 6)
- Noise as underlayer + texture presets from data/textures/ folder (hardcoded file list)
- Timer + alarm with on/off toggle
- FLAC/WAV texture files dropped into data/textures/, listed via API

## Architecture

### Backend (minimal)

```
GET /api/textures              -- list files in data/textures/
Static mount: /audio/textures/ -- serve texture files
data/textures/                 -- drop ambient loops here
```

### Frontend (new files)

```
stores/sleep.ts                       -- sleep state machine
hooks/useEntrainment.ts               -- Web Audio engine (4 layers)
hooks/useSleepTimer.ts                -- countdown, fadeout, alarm
components/sleep/SleepView.tsx        -- container routing setup/active
components/sleep/SleepSetup.tsx       -- pre-sleep configuration
components/sleep/SleepActive.tsx      -- black screen + tap-to-reveal
components/sleep/HorizonEffect.tsx    -- canvas transition animation
```

## Web Audio Entrainment Engine

Four layers mixed through a single AudioContext:

### Layer 1 -- Entrainment tones
- Headphone mode (binaural): Two OscillatorNodes, one per stereo channel via ChannelMergerNode. Left = base freq, right = base + beat freq. Brain perceives the difference.
- Speaker mode (isochronal): Single OscillatorNode amplitude-modulated by a low-frequency GainNode oscillating at target frequency.

### Layer 2 -- Noise generator
- AudioBufferSourceNode filled with white noise (10s random buffer, looped)
- BiquadFilterNode: brown = lowpass 200Hz, pink = lowpass 1000Hz

### Layer 3 -- Texture loop
- HTMLAudioElement with loop=true, connected via MediaElementSourceNode
- Points at /audio/textures/{filename}

### Layer 4 -- Music track
- Existing WaveSurfer/Web Audio playback
- Uses Phase 3 loop detection points for seamless repeat

All layers route through individual GainNodes into a master GainNode.

## Sleep Presets

Data-driven waypoint arrays for frequency ramping:

- Wind Down: 10Hz alpha -> 6Hz theta (30 min)
- Deep Sleep: 2Hz delta steady
- Full Cycle: 10Hz -> 6Hz -> 2Hz -> 6Hz -> 10Hz (90 min)
- Custom: user-defined start/end frequency + duration

Frequency updated every second via linear interpolation between waypoints.

### Z623 Bass Boost (speaker mode only)
BiquadFilterNode (peaking, 60Hz, gain +6dB) on the music layer.

## Sleep Timer & Alarm

### Timer
- Presets: 30m, 1hr, 2hr, 4hr, 8hr, endless
- Countdown via setInterval (1s tick)
- Last 5 minutes: master GainNode linear ramp to 0

### Alarm (toggleable on/off)
- Activates when timer expires
- Volume ramps 0 -> previous over 2 minutes
- Entrainment shifts delta 2Hz -> alpha 10Hz over 2 minutes
- Soft 432Hz sine tone fades in
- Auto-stops after 5 minutes if not dismissed
- Dismissed by tapping screen

### State Machine
```
Setup -> [Enter Sleep] -> Horizon Effect -> Active Sleep
Active Sleep -> [Timer expires] -> Fadeout -> Silence
Silence -> [Alarm on?] -> Alarm Ramp -> Setup
Silence -> [Alarm off?] -> Setup
Active Sleep -> [User taps Stop] -> Setup
```

## Sleep UI

### Setup Screen
Replaces main content area when Sleep tab active. Contains:
- Preset selector (4 buttons)
- Audio mode toggle (Headphones / Speakers)
- Timer duration selector (6 options)
- Alarm toggle (on/off)
- Noise type dropdown (Off / Brown / Pink)
- Texture dropdown (Off + files from data/textures/)
- Music track dropdown (None + library tracks)
- Loop mode (Auto detected / Full track repeat)
- Volume sliders: Music, Entrainment, Noise, Texture
- "Enter Sleep" button

### Horizon Transition (3-5s)
- Canvas overlaid on entire screen
- Waveform flattens to horizontal line at center
- Line pulses twice with subtle glow
- Fades to pure black
- requestAnimationFrame loop on Canvas 2D

### Active Sleep Screen
- Full viewport, background #000000
- Cursor hidden after 2s of no movement
- Tap/click/mousemove reveals overlay for 5s:
  - Current time (clock)
  - Timer remaining
  - Current preset + frequency
  - Stop button
  - Volume slider
- All text in dim neutral-700

## Testing Strategy

### Backend (pytest)
- test_textures_api.py: list endpoint, empty dir, non-audio file filtering

### Frontend (vitest)
- sleep.test.ts: store state transitions, preset changes, timer, alarm toggle, volume levels

### E2E (Playwright)
- Sleep tab navigation
- Preset/mode/timer selection
- Alarm toggle
- Enter Sleep button
- Volume sliders present
- Active sleep shows on Enter Sleep click
