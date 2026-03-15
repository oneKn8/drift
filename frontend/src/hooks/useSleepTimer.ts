import { useEffect, useRef, useCallback } from "react";
import { useSleepStore } from "../stores/sleep";

const FADEOUT_DURATION = 300; // 5 minutes in seconds
const ALARM_RAMP_DURATION = 120; // 2 minutes
const ALARM_AUTO_STOP = 300; // 5 minutes

export function useSleepTimer(getMasterGain: () => GainNode | null) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const alarmIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const alarmOscRef = useRef<OscillatorNode | null>(null);
  const alarmGainRef = useRef<GainNode | null>(null);

  const {
    timerDuration,
    alarmEnabled,
    setTimerRemaining,
    setPhase,
    setCurrentFreq,
  } = useSleepStore();

  const dismissAlarm = useCallback(() => {
    if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);
    try { alarmOscRef.current?.stop(); } catch { /* already stopped */ }
    alarmOscRef.current = null;
    alarmGainRef.current = null;
    setPhase("setup");
    useSleepStore.getState().reset();
  }, [setPhase]);

  const startAlarm = useCallback(() => {
    const gain = getMasterGain();
    if (!gain || !gain.context) return;

    const ctx = gain.context as AudioContext;

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.6, ctx.currentTime + ALARM_RAMP_DURATION);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0, ctx.currentTime);
    oscGain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + ALARM_RAMP_DURATION);
    oscGain.connect(ctx.destination);
    alarmGainRef.current = oscGain;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 432;
    osc.connect(oscGain);
    osc.start();
    alarmOscRef.current = osc;

    let elapsed = 0;
    alarmIntervalRef.current = setInterval(() => {
      elapsed++;
      const t = Math.min(elapsed / ALARM_RAMP_DURATION, 1);
      const freq = 2 + t * 8; // 2Hz -> 10Hz
      setCurrentFreq(freq);

      if (elapsed >= ALARM_AUTO_STOP) {
        dismissAlarm();
      }
    }, 1000);
  }, [getMasterGain, setCurrentFreq, dismissAlarm]);

  const startTimer = useCallback(() => {
    if (timerDuration === 0) return; // endless
    setTimerRemaining(timerDuration);

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const store = useSleepStore.getState();
      const remaining = store.timerRemaining - 1;

      if (remaining <= 0) {
        clearInterval(intervalRef.current);
        setTimerRemaining(0);
        if (!store.alarmEnabled) {
          setPhase("setup");
          useSleepStore.getState().reset();
        }
        return;
      }

      setTimerRemaining(remaining);

      // Fadeout in last FADEOUT_DURATION seconds
      if (remaining <= FADEOUT_DURATION) {
        const gain = getMasterGain();
        if (gain) {
          gain.gain.value = remaining / FADEOUT_DURATION;
        }
      }
    }, 1000);
  }, [timerDuration, setTimerRemaining, setPhase, getMasterGain]);

  const stopTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);
    setTimerRemaining(0);
  }, [setTimerRemaining]);

  // Watch for timer expiry + alarm trigger
  useEffect(() => {
    const unsub = useSleepStore.subscribe((state, prevState) => {
      if (
        state.phase === "active" &&
        state.timerRemaining === 0 &&
        prevState.timerRemaining > 0 &&
        state.timerDuration > 0 &&
        state.alarmEnabled
      ) {
        startAlarm();
      }
    });
    return unsub;
  }, [startAlarm]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);
      try { alarmOscRef.current?.stop(); } catch { /* cleanup */ }
    };
  }, []);

  return { startTimer, stopTimer, dismissAlarm };
}
