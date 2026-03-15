import { describe, it, expect, beforeEach } from "vitest";
import { useLibraryStore } from "../library";

describe("libraryStore", () => {
  beforeEach(() => {
    useLibraryStore.setState({ tracks: [], loading: false, error: null });
  });

  it("starts with empty tracks", () => {
    const state = useLibraryStore.getState();
    expect(state.tracks).toEqual([]);
    expect(state.loading).toBe(false);
  });

  it("adds a track", () => {
    const track = {
      id: "abc123",
      filename: "test.mp3",
      bpm: 120,
      key: "Am",
      duration: 180,
      energy: 0.5,
      sample_rate: 44100,
      channels: 2,
      waveform_peaks: [],
      file_path: "abc123.mp3",
      uploaded_at: "2026-03-15T00:00:00Z",
    };
    useLibraryStore.getState().addTrack(track);
    expect(useLibraryStore.getState().tracks).toHaveLength(1);
    expect(useLibraryStore.getState().tracks[0].id).toBe("abc123");
  });

  it("removes a track", () => {
    const track = {
      id: "abc123",
      filename: "test.mp3",
      bpm: 120,
      key: "Am",
      duration: 180,
      energy: 0.5,
      sample_rate: 44100,
      channels: 2,
      waveform_peaks: [],
      file_path: "abc123.mp3",
      uploaded_at: "2026-03-15T00:00:00Z",
    };
    useLibraryStore.getState().addTrack(track);
    useLibraryStore.getState().removeTrack("abc123");
    expect(useLibraryStore.getState().tracks).toHaveLength(0);
  });
});
