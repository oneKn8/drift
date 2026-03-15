import { useCallback } from "react";
import { useSleepStore, PRESETS } from "../../stores/sleep";
import { useEntrainment } from "../../hooks/useEntrainment";
import { useSleepTimer } from "../../hooks/useSleepTimer";
import { SleepSetup } from "./SleepSetup";
import { HorizonEffect } from "./HorizonEffect";
import { SleepActive } from "./SleepActive";
import { useUIStore } from "../../stores/ui";

export function SleepView() {
  const { phase, setPhase, preset, audioMode, noiseType, texture, customStartFreq, customEndFreq } =
    useSleepStore();

  const entrainment = useEntrainment();
  const timer = useSleepTimer(entrainment.getMasterGain);

  const handleEnterSleep = useCallback(() => {
    setPhase("transition");
  }, [setPhase]);

  const handleTransitionComplete = useCallback(() => {
    setPhase("active");

    const presetData = PRESETS[preset];
    let waypoints = presetData.waypoints;
    let durationMs = presetData.durationMin * 60 * 1000;

    if (preset === "custom") {
      waypoints = [
        { time: 0, freq: customStartFreq },
        { time: 1, freq: customEndFreq },
      ];
    }

    const initialFreq = waypoints[0].freq;
    entrainment.startEntrainment(audioMode, initialFreq);
    entrainment.startNoise(noiseType);
    entrainment.startBassBoost(audioMode);

    if (texture) {
      entrainment.startTexture(texture);
    }

    entrainment.startFrequencyRamp(waypoints, durationMs);
    timer.startTimer();
  }, [preset, audioMode, noiseType, texture, customStartFreq, customEndFreq, entrainment, timer, setPhase]);

  const handleStop = useCallback(() => {
    entrainment.stopAll();
    timer.stopTimer();
    useSleepStore.getState().reset();
    useUIStore.getState().setMainView("waveform");
  }, [entrainment, timer]);

  const handleDismissAlarm = useCallback(() => {
    timer.dismissAlarm();
    entrainment.stopAll();
    useUIStore.getState().setMainView("waveform");
  }, [timer, entrainment]);

  if (phase === "transition") {
    return <HorizonEffect onComplete={handleTransitionComplete} />;
  }

  if (phase === "active") {
    return <SleepActive onStop={handleStop} onDismissAlarm={handleDismissAlarm} />;
  }

  return <SleepSetup onEnterSleep={handleEnterSleep} />;
}
