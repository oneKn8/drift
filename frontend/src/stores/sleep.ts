import { create } from "zustand";

export type SleepPhase = "setup" | "transition" | "active";
export type SleepPreset = "wind_down" | "deep_sleep" | "full_cycle" | "custom";
export type AudioMode = "headphones" | "speakers";
export type NoiseType = "off" | "brown" | "pink";
type VolumeLayer = "music" | "entrainment" | "noise" | "texture";

export interface FreqWaypoint {
  time: number;
  freq: number;
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
  timerDuration: number;
  alarmEnabled: boolean;
  noiseType: NoiseType;
  texture: string | null;
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
