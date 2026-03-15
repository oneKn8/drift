import { useEffect, useRef, useCallback } from "react";
import { useSleepStore } from "../stores/sleep";
import type { AudioMode, NoiseType, FreqWaypoint } from "../stores/sleep";

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

function interpWaypoints(waypoints: FreqWaypoint[], t: number): number {
  const ct = clamp(t, 0, 1);
  for (let i = 0; i < waypoints.length - 1; i++) {
    if (ct >= waypoints[i].time && ct <= waypoints[i + 1].time) {
      const segT =
        (ct - waypoints[i].time) / (waypoints[i + 1].time - waypoints[i].time);
      return lerp(waypoints[i].freq, waypoints[i + 1].freq, segT);
    }
  }
  return waypoints[waypoints.length - 1].freq;
}

const BASE_FREQ = 200;

interface AudioNodes {
  binauralLeft?: OscillatorNode;
  binauralRight?: OscillatorNode;
  isoOsc?: OscillatorNode;
  isoLfo?: OscillatorNode;
  isoLfoGain?: GainNode;
  noiseSource?: AudioBufferSourceNode;
  noiseGain?: GainNode;
  noiseFilter?: BiquadFilterNode;
  textureEl?: HTMLAudioElement;
  textureGain?: GainNode;
  entrainmentGain?: GainNode;
  bassBoost?: BiquadFilterNode;
  merger?: ChannelMergerNode;
}

export function useEntrainment() {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const nodesRef = useRef<AudioNodes>({});
  const freqIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const { volumes, setCurrentFreq } = useSleepStore();

  const createContext = useCallback(() => {
    if (ctxRef.current) return ctxRef.current;
    const ctx = new AudioContext();
    ctxRef.current = ctx;

    const master = ctx.createGain();
    master.gain.value = 1.0;
    master.connect(ctx.destination);
    masterGainRef.current = master;

    return ctx;
  }, []);

  const startEntrainment = useCallback(
    (mode: AudioMode, beatFreq: number) => {
      const ctx = createContext();
      const master = masterGainRef.current!;
      const nodes = nodesRef.current;

      const eGain = ctx.createGain();
      eGain.gain.value = useSleepStore.getState().volumes.entrainment;
      eGain.connect(master);
      nodes.entrainmentGain = eGain;

      if (mode === "headphones") {
        const merger = ctx.createChannelMerger(2);
        merger.connect(eGain);
        nodes.merger = merger;

        const left = ctx.createOscillator();
        left.type = "sine";
        left.frequency.value = BASE_FREQ;
        left.connect(merger, 0, 0);
        left.start();
        nodes.binauralLeft = left;

        const right = ctx.createOscillator();
        right.type = "sine";
        right.frequency.value = BASE_FREQ + beatFreq;
        right.connect(merger, 0, 1);
        right.start();
        nodes.binauralRight = right;
      } else {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = BASE_FREQ;

        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0;
        nodes.isoLfoGain = lfoGain;

        osc.connect(lfoGain);
        lfoGain.connect(eGain);
        osc.start();
        nodes.isoOsc = osc;

        const lfo = ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = beatFreq;
        lfo.connect(lfoGain.gain);
        lfo.start();
        nodes.isoLfo = lfo;
      }
    },
    [createContext]
  );

  const startNoise = useCallback(
    (type: NoiseType) => {
      if (type === "off") return;
      const ctx = createContext();
      const master = masterGainRef.current!;
      const nodes = nodesRef.current;

      const bufferSize = ctx.sampleRate * 10;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = type === "brown" ? 200 : 1000;
      nodes.noiseFilter = filter;

      const gain = ctx.createGain();
      gain.gain.value = useSleepStore.getState().volumes.noise;
      nodes.noiseGain = gain;

      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start();
      nodes.noiseSource = source;
    },
    [createContext]
  );

  const startTexture = useCallback(
    (filename: string) => {
      const ctx = createContext();
      const master = masterGainRef.current!;
      const nodes = nodesRef.current;

      const el = new Audio(`/audio/textures/${filename}`);
      el.loop = true;
      el.crossOrigin = "anonymous";
      nodes.textureEl = el;

      const source = ctx.createMediaElementSource(el);
      const gain = ctx.createGain();
      gain.gain.value = useSleepStore.getState().volumes.texture;
      nodes.textureGain = gain;

      source.connect(gain);
      gain.connect(master);
      el.play().catch(() => {});
    },
    [createContext]
  );

  const startBassBoost = useCallback(
    (mode: AudioMode) => {
      if (mode !== "speakers") return;
      const ctx = createContext();
      const nodes = nodesRef.current;

      const boost = ctx.createBiquadFilter();
      boost.type = "peaking";
      boost.frequency.value = 60;
      boost.gain.value = 6;
      boost.Q.value = 1;
      nodes.bassBoost = boost;
    },
    [createContext]
  );

  const updateFrequency = useCallback(
    (freq: number) => {
      const nodes = nodesRef.current;
      if (nodes.binauralRight) {
        nodes.binauralRight.frequency.value = BASE_FREQ + freq;
      }
      if (nodes.isoLfo) {
        nodes.isoLfo.frequency.value = freq;
      }
      setCurrentFreq(freq);
    },
    [setCurrentFreq]
  );

  const startFrequencyRamp = useCallback(
    (waypoints: FreqWaypoint[], durationMs: number) => {
      const startTime = Date.now();
      if (freqIntervalRef.current) clearInterval(freqIntervalRef.current);

      freqIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const t = Math.min(elapsed / durationMs, 1);
        const freq = interpWaypoints(waypoints, t);
        updateFrequency(freq);
        if (t >= 1) clearInterval(freqIntervalRef.current);
      }, 1000);
    },
    [updateFrequency]
  );

  const stopAll = useCallback(() => {
    if (freqIntervalRef.current) clearInterval(freqIntervalRef.current);
    const nodes = nodesRef.current;

    try { nodes.binauralLeft?.stop(); } catch { /* already stopped */ }
    try { nodes.binauralRight?.stop(); } catch { /* already stopped */ }
    try { nodes.isoOsc?.stop(); } catch { /* already stopped */ }
    try { nodes.isoLfo?.stop(); } catch { /* already stopped */ }
    try { nodes.noiseSource?.stop(); } catch { /* already stopped */ }
    if (nodes.textureEl) {
      nodes.textureEl.pause();
      nodes.textureEl.src = "";
    }

    nodesRef.current = {};

    if (ctxRef.current && ctxRef.current.state !== "closed") {
      ctxRef.current.close().catch(() => {});
    }
    ctxRef.current = null;
    masterGainRef.current = null;
  }, []);

  const getMasterGain = useCallback(() => masterGainRef.current, []);

  // Update volumes in real-time
  useEffect(() => {
    const nodes = nodesRef.current;
    if (nodes.entrainmentGain) nodes.entrainmentGain.gain.value = volumes.entrainment;
    if (nodes.noiseGain) nodes.noiseGain.gain.value = volumes.noise;
    if (nodes.textureGain) nodes.textureGain.gain.value = volumes.texture;
  }, [volumes]);

  useEffect(() => {
    return () => stopAll();
  }, [stopAll]);

  return {
    startEntrainment,
    startNoise,
    startTexture,
    startBassBoost,
    startFrequencyRamp,
    updateFrequency,
    stopAll,
    getMasterGain,
  };
}
