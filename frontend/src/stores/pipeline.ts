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
  completedTracks: Set<string>;
  setStageStatus: (name: string, status: ProcessingStatus, progress?: number) => void;
  setStageModel: (name: string, model: string) => void;
  resetPipeline: () => void;
  markTrackComplete: (trackId: string) => void;
  isTrackComplete: (trackId: string) => boolean;
}

const defaultStages: PipelineStage[] = [
  { name: "analysis", model: "librosa", status: "idle", progress: 0 },
  { name: "separation", model: "htdemucs", status: "idle", progress: 0 },
  { name: "denoise", model: "deepfilter", status: "idle", progress: 0 },
  { name: "super_resolution", model: "flashsr", status: "idle", progress: 0 },
  { name: "mastering", model: "matchering", status: "idle", progress: 0 },
];

export const usePipelineStore = create<PipelineState>((set, get) => ({
  stages: [...defaultStages],
  completedTracks: new Set<string>(),
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
  markTrackComplete: (trackId) =>
    set((state) => {
      const next = new Set(state.completedTracks);
      next.add(trackId);
      return { completedTracks: next };
    }),
  isTrackComplete: (trackId) => get().completedTracks.has(trackId),
}));
