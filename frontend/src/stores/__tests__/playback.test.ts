import { describe, it, expect, beforeEach } from "vitest";
import { usePlaybackStore } from "../playback";

describe("playbackStore", () => {
  beforeEach(() => {
    usePlaybackStore.setState({
      isPlaying: false,
      currentTrackId: null,
      currentTime: 0,
      duration: 0,
      volume: 0.8,
      abMode: "processed",
    });
  });

  it("starts paused", () => {
    expect(usePlaybackStore.getState().isPlaying).toBe(false);
  });

  it("toggles play state", () => {
    usePlaybackStore.getState().togglePlay();
    expect(usePlaybackStore.getState().isPlaying).toBe(true);
    usePlaybackStore.getState().togglePlay();
    expect(usePlaybackStore.getState().isPlaying).toBe(false);
  });

  it("toggles A/B mode", () => {
    expect(usePlaybackStore.getState().abMode).toBe("processed");
    usePlaybackStore.getState().toggleAB();
    expect(usePlaybackStore.getState().abMode).toBe("original");
    usePlaybackStore.getState().toggleAB();
    expect(usePlaybackStore.getState().abMode).toBe("processed");
  });

  it("sets volume", () => {
    usePlaybackStore.getState().setVolume(0.5);
    expect(usePlaybackStore.getState().volume).toBe(0.5);
  });
});
