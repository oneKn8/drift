import { create } from "zustand";

export interface Crossfade {
  from: string;
  to: string;
  duration_s: number;
  type: string;
}

export interface LoopInfo {
  found: boolean;
  start_s: number;
  end_s: number;
  crossfade_s: number;
  score: number;
}

export interface ExportSettings {
  format: "FLAC" | "WAV";
  sampleRate: 44100 | 48000 | 96000;
  bitDepth: 16 | 24;
  lufsTarget: number;
}

type RenderStatus = "idle" | "rendering" | "complete";

interface ArrangementState {
  arrangementId: string | null;
  tracks: string[];
  crossfades: Crossfade[];
  totalDuration: number;
  excluded: Set<string>;
  loops: Record<string, LoopInfo>;
  exportSettings: ExportSettings;
  renderStatus: RenderStatus;
  setArrangement: (arr: {
    id: string;
    tracks: string[];
    crossfades: Crossfade[];
    total_duration_s: number;
  }) => void;
  updateCrossfade: (index: number, duration_s: number) => void;
  toggleExclude: (trackId: string) => void;
  setLoop: (trackId: string, loop: LoopInfo) => void;
  setExportSettings: (settings: Partial<ExportSettings>) => void;
  setRenderStatus: (status: RenderStatus) => void;
  reset: () => void;
}

const defaultExport: ExportSettings = {
  format: "FLAC",
  sampleRate: 48000,
  bitDepth: 24,
  lufsTarget: -14,
};

export const useArrangementStore = create<ArrangementState>()((set) => ({
  arrangementId: null,
  tracks: [],
  crossfades: [],
  totalDuration: 0,
  excluded: new Set<string>(),
  loops: {},
  exportSettings: { ...defaultExport },
  renderStatus: "idle",

  setArrangement: (arr) =>
    set({
      arrangementId: arr.id,
      tracks: arr.tracks,
      crossfades: arr.crossfades,
      totalDuration: arr.total_duration_s,
    }),

  updateCrossfade: (index, duration_s) =>
    set((state) => ({
      crossfades: state.crossfades.map((xf, i) =>
        i === index ? { ...xf, duration_s } : xf
      ),
    })),

  toggleExclude: (trackId) =>
    set((state) => {
      const next = new Set(state.excluded);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return { excluded: next };
    }),

  setLoop: (trackId, loop) =>
    set((state) => ({ loops: { ...state.loops, [trackId]: loop } })),

  setExportSettings: (settings) =>
    set((state) => ({
      exportSettings: { ...state.exportSettings, ...settings },
    })),

  setRenderStatus: (status) => set({ renderStatus: status }),

  reset: () =>
    set({
      arrangementId: null,
      tracks: [],
      crossfades: [],
      totalDuration: 0,
      excluded: new Set(),
      loops: {},
      renderStatus: "idle",
    }),
}));
