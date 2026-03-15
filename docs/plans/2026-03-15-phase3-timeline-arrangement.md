# Phase 3: Timeline & Arrangement -- Design

Date: 2026-03-15

## Objective

Add auto-arrangement, loop detection, mix rendering, and a timeline visualization. The system arranges tracks automatically; the user reviews and tweaks with light controls (crossfade duration, exclude tracks, lock order). No manual DAW-style editing.

## Decisions

- Auto with knobs: system arranges, user adjusts crossfade length, locks/unlocks segments, excludes tracks
- Both per-track loop detection AND multi-track mix generation
- Arrangement heuristic: energy curve (0.6) + key compatibility (0.3) + BPM proximity (0.1)
- Export: FLAC + WAV only, 44.1/48/96kHz, 16/24-bit
- Phase 4 RL replaces the heuristic; API contract stays identical

## Architecture

### New Backend Services

```
services/arrangement.py  -- auto-arrange tracks by energy + key/BPM
services/loop_detect.py  -- find seamless loop points per track
services/mixer.py        -- render crossfaded mix + export FLAC/WAV
tasks/mix_render.py      -- Celery task for mix rendering
```

### New Frontend Components

```
components/timeline/Timeline.tsx       -- horizontal track blocks with crossfade zones
components/timeline/TimelineTrack.tsx  -- single track block
stores/arrangement.ts                  -- arrangement state
```

### New API Endpoints

```
POST /api/arrange              -- auto-arrange a set of tracks
POST /api/loop/{track_id}      -- detect loop points for a single track
POST /api/mix/render           -- render arrangement to final audio file
GET  /api/mix/status/{mix_id}  -- poll render progress
GET  /api/exports/{file}       -- download rendered file (static mount already exists)
```

## Auto-Arrangement Engine

Takes a list of track IDs, loads their analysis metadata, outputs optimal ordering with crossfade parameters.

### Algorithm

1. Load BPM, key, energy for each track
2. Build compatibility score matrix between all track pairs:
   - Energy smoothness: penalize large energy jumps (weight 0.6)
   - Key compatibility: Camelot wheel scoring (weight 0.3)
   - BPM proximity: penalize BPM differences > 10% (weight 0.1)
3. Greedy nearest-neighbor ordering seeded from lowest-energy track
4. Per-pair crossfade duration: 3-15s, scaled by BPM similarity

### Output Format

Saved as `data/arrangements/{arrangement_id}.json`:

```json
{
  "id": "arr_abc123",
  "tracks": ["id1", "id2", "id3"],
  "crossfades": [
    {"from": "id1", "to": "id2", "duration_s": 8.0, "type": "equal_power"},
    {"from": "id2", "to": "id3", "duration_s": 5.0, "type": "equal_power"}
  ],
  "total_duration_s": 542.0
}
```

Crossfade type is always `equal_power` in Phase 3. Phase 4 adds beat-synced and stem-staggered via RL. User can override crossfade duration per transition. Arrangement can be regenerated with tracks excluded or ordering locked.

## Loop Point Detection

Finds the best seamless loop point in a single track.

### Algorithm

1. Compute chroma features (12-bin, hop 512) via librosa
2. Build self-similarity matrix (cosine similarity)
3. Find candidate loop regions: off-diagonal high-similarity segments > 4 bars
4. Snap candidates to beat boundaries from existing beat grid
5. Score candidates: chroma similarity (0.4) + energy match (0.3) + spectral centroid match (0.2) + duration preference (0.1)
6. Select top candidate. If none scores above 0.6, mark "no clean loop found"
7. Compute crossfade zone: 2-8 bars, equal-power, zero-crossing aligned

### Output

Saved to track metadata:

```json
{
  "loop": {
    "start_s": 12.4,
    "end_s": 185.2,
    "crossfade_s": 4.8,
    "score": 0.82,
    "found": true
  }
}
```

Loop preview plays in browser via Web Audio API (client-side loop transition). Export renders the actual seamless file.

## Mix Rendering & Export

Celery task that takes an arrangement and renders to a single lossless file. Progress via Redis pub/sub (same pattern as pipeline).

### Process

1. Load each track in arrangement order (soundfile, float32)
2. Resample all to highest rate in set (or target from export settings)
3. Apply equal-power crossfade curves at each transition zone
4. Concatenate non-overlapping segments with crossfade zones
5. Final loudness normalization to -14 LUFS (pyloudnorm)
6. Write output file

### Export Settings (user-configurable)

- Format: FLAC (default) or WAV
- Sample rate: 44100, 48000, or 96000 Hz
- Bit depth: 16 or 24-bit
- LUFS target: -14 (default), adjustable -8 to -20

### Output Paths

- Mix render: `data/exports/{mix_id}/mix.flac`
- Loop render: `data/exports/{track_id}/loop.flac`

Loop export renders one track from loop start through crossfade zone back to loop start -- seamless on repeat in any player.

### Progress

Stage name `"mix_render"` with progress 0.0-1.0. Frontend reuses existing WebSocket listener.

## Frontend: Timeline & Controls

Timeline is a horizontal visualization in the main content area. Two modes toggled from top bar: Waveform (existing) and Timeline.

### Timeline Layout

```
+------------------------------------------------------------------+
| [Track 1 ████████████]--xfade--[Track 2 ████████████]--xfade--[T3|
|  Nebula Drift  8:02    5.0s    Nebula Slumber  6:44    3.0s      |
+------------------------------------------------------------------+
  ▶ playing position indicator (thin vertical line)
```

Each track block shows: name, duration, energy bar (colored fill). Crossfade zones show duration label. No free drag -- reorder via up/down buttons or exclude via toggle.

### Controls Panel

Below timeline (replaces pipeline panel when in timeline mode):

- "Auto Arrange" button -- triggers arrangement API
- Per-crossfade duration slider (3-15s)
- Track exclude toggles
- Lock ordering checkbox
- Export settings: format dropdown, sample rate, bit depth
- "Render Mix" button -- shows progress bar
- "Find Loops" button -- loop detection on selected track
- Loop preview toggle (Web Audio seamless playback)

### New Store (arrangement.ts)

- `tracks: string[]` -- ordered track IDs
- `crossfades: Crossfade[]` -- duration + type per pair
- `loops: Record<string, LoopInfo>` -- per-track loop data
- `exportSettings: ExportSettings`
- `renderStatus: "idle" | "rendering" | "complete"`

## Testing Strategy

### Backend (pytest)

- `test_arrangement.py` -- score matrix, greedy ordering, energy arc, key compatibility, empty/single track edge cases
- `test_loop_detect.py` -- loop detection on synthetic WAV with repeated section, beat-snap, score threshold
- `test_mixer.py` -- crossfade math (equal-power sums to ~1.0), resampling, LUFS normalization, FLAC/WAV validity
- `test_mix_render_task.py` -- Celery task chain, progress broadcasts, partial failure

### Frontend (vitest)

- `arrangement.test.ts` -- store state: add/remove/reorder, crossfade updates, export settings, render status

### E2E (Playwright)

- Timeline view toggle visible
- Auto Arrange disabled with < 2 tracks, enabled with 2+
- Arrange produces timeline with track blocks
- Export settings dropdowns present
- Loop detection button works on selected track

### Audio Validation (in backend tests)

- Rendered mix duration = sum of tracks minus crossfade overlaps (within 0.5s)
- Output sample rate matches export setting
- Output not silent (RMS > threshold)
- Output not clipped (no samples at +/- 1.0)
- FLAC metadata readable by soundfile
