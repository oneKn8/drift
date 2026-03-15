import { create } from "zustand";

export interface Track {
  id: string;
  filename: string;
  file_path: string;
  uploaded_at: string;
  bpm: number;
  key: string;
  duration: number;
  sample_rate: number;
  channels: number;
  energy: number;
  waveform_peaks: number[];
}

interface LibraryState {
  tracks: Track[];
  loading: boolean;
  error: string | null;
  addTrack: (track: Track) => void;
  removeTrack: (id: string) => void;
  setTracks: (tracks: Track[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  tracks: [],
  loading: false,
  error: null,
  addTrack: (track) =>
    set((state) => ({ tracks: [...state.tracks, track] })),
  removeTrack: (id) =>
    set((state) => ({ tracks: state.tracks.filter((t) => t.id !== id) })),
  setTracks: (tracks) => set({ tracks }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
