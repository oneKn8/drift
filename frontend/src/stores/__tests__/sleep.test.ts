import { describe, it, expect, beforeEach } from "vitest";
import { useSleepStore } from "../sleep";

describe("sleep store", () => {
  beforeEach(() => {
    useSleepStore.setState(useSleepStore.getInitialState());
  });

  it("starts in setup phase", () => {
    expect(useSleepStore.getState().phase).toBe("setup");
  });

  it("sets preset", () => {
    useSleepStore.getState().setPreset("deep_sleep");
    expect(useSleepStore.getState().preset).toBe("deep_sleep");
  });

  it("sets audio mode", () => {
    useSleepStore.getState().setAudioMode("headphones");
    expect(useSleepStore.getState().audioMode).toBe("headphones");
  });

  it("sets timer duration", () => {
    useSleepStore.getState().setTimerDuration(7200);
    expect(useSleepStore.getState().timerDuration).toBe(7200);
  });

  it("toggles alarm", () => {
    useSleepStore.getState().toggleAlarm();
    expect(useSleepStore.getState().alarmEnabled).toBe(false);
    useSleepStore.getState().toggleAlarm();
    expect(useSleepStore.getState().alarmEnabled).toBe(true);
  });

  it("sets noise type", () => {
    useSleepStore.getState().setNoiseType("pink");
    expect(useSleepStore.getState().noiseType).toBe("pink");
  });

  it("sets texture", () => {
    useSleepStore.getState().setTexture("rain.mp3");
    expect(useSleepStore.getState().texture).toBe("rain.mp3");
  });

  it("sets volumes independently", () => {
    useSleepStore.getState().setVolume("entrainment", 0.5);
    expect(useSleepStore.getState().volumes.entrainment).toBe(0.5);
    expect(useSleepStore.getState().volumes.music).toBe(0.6);
  });

  it("transitions phases", () => {
    useSleepStore.getState().setPhase("transition");
    expect(useSleepStore.getState().phase).toBe("transition");
    useSleepStore.getState().setPhase("active");
    expect(useSleepStore.getState().phase).toBe("active");
  });

  it("sets custom frequency", () => {
    useSleepStore.getState().setCustomFreq(8, 2);
    expect(useSleepStore.getState().customStartFreq).toBe(8);
    expect(useSleepStore.getState().customEndFreq).toBe(2);
  });

  it("tracks current frequency", () => {
    useSleepStore.getState().setCurrentFreq(4.5);
    expect(useSleepStore.getState().currentFreq).toBe(4.5);
  });

  it("resets to defaults", () => {
    useSleepStore.getState().setPreset("deep_sleep");
    useSleepStore.getState().setPhase("active");
    useSleepStore.getState().reset();
    expect(useSleepStore.getState().phase).toBe("setup");
    expect(useSleepStore.getState().preset).toBe("wind_down");
  });
});
