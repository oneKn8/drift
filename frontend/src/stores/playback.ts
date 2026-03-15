import { create } from "zustand";

type ABMode = "original" | "processed";

interface PlaybackState {
  isPlaying: boolean;
  currentTrackId: string | null;
  currentTime: number;
  duration: number;
  volume: number;
  abMode: ABMode;
  togglePlay: () => void;
  play: (trackId: string) => void;
  pause: () => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  toggleAB: () => void;
}

export const usePlaybackStore = create<PlaybackState>((set) => ({
  isPlaying: false,
  currentTrackId: null,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  abMode: "processed",
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  play: (trackId) => set({ currentTrackId: trackId, isPlaying: true, currentTime: 0 }),
  pause: () => set({ isPlaying: false }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
  toggleAB: () =>
    set((state) => ({
      abMode: state.abMode === "original" ? "processed" : "original",
    })),
}));
