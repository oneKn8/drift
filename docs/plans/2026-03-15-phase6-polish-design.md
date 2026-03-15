# Phase 6: Polish & Ship -- Design

Date: 2026-03-15

## Objective

Production-quality developer experience, visual polish, and wow-factor visualizations. Make the app feel finished, make the repo easy to run, make people screenshot it.

## Scope

### 1. Setup Script
- `./start.sh` -- checks prerequisites, creates venv, installs deps, starts backend + Celery + frontend
- `./stop.sh` -- kills all processes
- No Docker for app (only Redis stays in Docker)

### 2. Toast Notification System
- Global toast container (top-right)
- Types: success, error, info
- Auto-dismiss 5s
- Zustand store for toast queue
- Used for: upload, pipeline, mix render, connection errors

### 3. Keyboard Shortcuts
- Space = play/pause
- Escape = exit sleep active / close panels
- 1/2/3 = Waveform/Timeline/Sleep views
- Global keydown listener, disabled when input/select focused

### 4. Drag-Drop Anywhere
- Drop audio files anywhere on the page
- Full-page drop overlay with visual feedback
- Reuses existing upload logic from LibraryPanel

### 5. Loading States
- Pipeline stage cards: animated spinner when processing
- Track cards: skeleton pulse during upload
- Mix render: progress bar
- Enter Sleep: brief loading state
- All transitions via Framer Motion

### 6. Terrain Mesh Visualizer (main playback view)
- Raw WebGL canvas behind WaveSurfer
- 128x64 vertex grid mesh at 30 degree tilt
- FFT data from Web Audio AnalyserNode displaces vertices
- Vertex shader: Y displacement by frequency magnitude
- Fragment shader: height-based color (dark base -> accent peaks)
- Lerp between FFT frames for smooth motion
- Paused state: slow sine undulation
- Monochrome + single accent color

### 7. Spectral Waterfall (pipeline view)
- Canvas 2D in pipeline panel area
- One pixel row per frame, scrolls down
- Color mapped by intensity: black -> neutral-700 -> accent -> white
- Before/after split when A/B active
- Shows enhancement effect visually

### 8. Micro-interactions (Framer Motion)
- Buttons: scale 0.97 on press
- Cards: translateY -2px on hover, subtle shadow
- Panels: slide from edge (library left, pipeline bottom)
- Stage completion: checkmark stroke animation
- Progress bars: shimmer gradient sweep
- View transitions: crossfade 150ms
- Toast: slide in right, fade+slide out

## Testing

### Frontend (vitest)
- toast.test.ts: add/remove/auto-dismiss/queue

### E2E (Playwright)
- Keyboard shortcuts work
- Drag-drop upload works
- Toast appears on upload success
- Loading states visible during operations
- Terrain visualizer canvas renders

## Architecture Notes

- Terrain mesh: raw WebGL, no Three.js. Two shaders (~80 lines GLSL), one draw call per frame
- Waterfall: Canvas 2D, one getByteFrequencyData() per frame
- Both visualizers share the same AnalyserNode from the audio playback chain
- Framer Motion already in deps, no new packages needed
- Toast store is independent, any component can dispatch toasts
