import { describe, it, expect, beforeEach } from "vitest";
import { useArrangementStore } from "../arrangement";

describe("arrangement store", () => {
  beforeEach(() => {
    useArrangementStore.setState(useArrangementStore.getInitialState());
  });

  it("starts empty", () => {
    const state = useArrangementStore.getState();
    expect(state.tracks).toEqual([]);
    expect(state.crossfades).toEqual([]);
    expect(state.renderStatus).toBe("idle");
  });

  it("sets arrangement", () => {
    const { setArrangement } = useArrangementStore.getState();
    setArrangement({
      id: "arr_1",
      tracks: ["t1", "t2"],
      crossfades: [{ from: "t1", to: "t2", duration_s: 5, type: "equal_power" }],
      total_duration_s: 300,
    });
    const state = useArrangementStore.getState();
    expect(state.tracks).toEqual(["t1", "t2"]);
    expect(state.crossfades).toHaveLength(1);
    expect(state.arrangementId).toBe("arr_1");
  });

  it("updates crossfade duration", () => {
    const { setArrangement, updateCrossfade } = useArrangementStore.getState();
    setArrangement({
      id: "arr_1",
      tracks: ["t1", "t2"],
      crossfades: [{ from: "t1", to: "t2", duration_s: 5, type: "equal_power" }],
      total_duration_s: 300,
    });
    updateCrossfade(0, 10);
    expect(useArrangementStore.getState().crossfades[0].duration_s).toBe(10);
  });

  it("excludes a track", () => {
    const { toggleExclude } = useArrangementStore.getState();
    toggleExclude("t2");
    expect(useArrangementStore.getState().excluded.has("t2")).toBe(true);
    toggleExclude("t2");
    expect(useArrangementStore.getState().excluded.has("t2")).toBe(false);
  });

  it("sets loop info", () => {
    const { setLoop } = useArrangementStore.getState();
    setLoop("t1", { found: true, start_s: 1, end_s: 10, crossfade_s: 2, score: 0.9 });
    expect(useArrangementStore.getState().loops["t1"]?.found).toBe(true);
  });

  it("sets render status", () => {
    const { setRenderStatus } = useArrangementStore.getState();
    setRenderStatus("rendering");
    expect(useArrangementStore.getState().renderStatus).toBe("rendering");
  });

  it("sets export settings", () => {
    const { setExportSettings } = useArrangementStore.getState();
    setExportSettings({ format: "WAV", sampleRate: 96000 });
    const s = useArrangementStore.getState().exportSettings;
    expect(s.format).toBe("WAV");
    expect(s.sampleRate).toBe(96000);
  });
});
