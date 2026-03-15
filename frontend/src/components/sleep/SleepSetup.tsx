import { useState, useEffect } from "react";
import { useSleepStore, PRESETS } from "../../stores/sleep";
import type { SleepPreset, AudioMode, NoiseType } from "../../stores/sleep";
import { useLibraryStore } from "../../stores/library";
import { fetchTextures } from "../../hooks/useApi";

interface SleepSetupProps {
  onEnterSleep: () => void;
}

const TIMER_OPTIONS = [
  { label: "30m", value: 1800 },
  { label: "1hr", value: 3600 },
  { label: "2hr", value: 7200 },
  { label: "4hr", value: 14400 },
  { label: "8hr", value: 28800 },
  { label: "--", value: 0 },
];

export function SleepSetup({ onEnterSleep }: SleepSetupProps) {
  const {
    preset, audioMode, timerDuration, alarmEnabled, noiseType, texture,
    trackId, loopMode, volumes, customStartFreq, customEndFreq,
    setPreset, setAudioMode, setTimerDuration, toggleAlarm, setNoiseType,
    setTexture, setTrackId, setLoopMode, setVolume, setCustomFreq,
  } = useSleepStore();

  const { tracks } = useLibraryStore();
  const [textures, setTextures] = useState<{ name: string; path: string }[]>([]);

  useEffect(() => {
    fetchTextures()
      .then((data) => setTextures(data.textures ?? []))
      .catch(() => {});
  }, []);

  const presetKeys = Object.keys(PRESETS) as SleepPreset[];

  return (
    <div className="flex-1 flex items-center justify-center overflow-y-auto p-8">
      <div className="w-full max-w-xl">
        <div className="text-center mb-8">
          <h2 className="text-base font-semibold tracking-tight mb-1">Sleep Mode</h2>
          <p className="text-xs text-neutral-500">Configure entrainment and ambient layers</p>
        </div>

        <div className="grid grid-cols-2 gap-5 mb-6">
          {/* Preset */}
          <div className="col-span-2">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1.5">Preset</div>
            <div className="grid grid-cols-4 gap-1.5">
              {presetKeys.map((key) => (
                <button
                  key={key}
                  onClick={() => setPreset(key)}
                  className={`py-2 text-xs font-medium rounded border transition-colors ${
                    preset === key
                      ? "border-neutral-600 text-neutral-100 bg-neutral-900"
                      : "border-neutral-800 text-neutral-500 hover:border-neutral-700"
                  }`}
                >
                  {PRESETS[key].label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom freq (only when custom preset) */}
          {preset === "custom" && (
            <div className="col-span-2 flex gap-4">
              <div className="flex-1">
                <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1.5">Start Hz</div>
                <input
                  type="number"
                  min={1}
                  max={40}
                  step={0.5}
                  value={customStartFreq}
                  onChange={(e) => setCustomFreq(parseFloat(e.target.value) || 10, customEndFreq)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-xs text-neutral-300 font-mono"
                />
              </div>
              <div className="flex-1">
                <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1.5">End Hz</div>
                <input
                  type="number"
                  min={1}
                  max={40}
                  step={0.5}
                  value={customEndFreq}
                  onChange={(e) => setCustomFreq(customStartFreq, parseFloat(e.target.value) || 2)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-xs text-neutral-300 font-mono"
                />
              </div>
            </div>
          )}

          {/* Audio Mode */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1.5">Audio Output</div>
            <div className="flex border border-neutral-800 rounded overflow-hidden">
              {(["headphones", "speakers"] as AudioMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setAudioMode(mode)}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    audioMode === mode ? "bg-neutral-900 text-neutral-100" : "text-neutral-600"
                  }`}
                >
                  {mode === "headphones" ? "Headphones" : "Speakers"}
                </button>
              ))}
            </div>
          </div>

          {/* Timer */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1.5">Timer</div>
            <div className="grid grid-cols-6 gap-1">
              {TIMER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTimerDuration(opt.value)}
                  className={`py-1.5 text-[10px] font-mono rounded border transition-colors ${
                    timerDuration === opt.value
                      ? "border-neutral-600 text-neutral-100 bg-neutral-900"
                      : "border-neutral-800 text-neutral-600"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Alarm */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1.5">Alarm</div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">Wake-up ramp</span>
              <button
                onClick={toggleAlarm}
                role="switch"
                aria-checked={alarmEnabled}
                className={`w-9 h-5 rounded-full relative transition-colors ${
                  alarmEnabled ? "bg-neutral-600" : "bg-neutral-800"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-neutral-300 absolute top-0.5 transition-all ${
                    alarmEnabled ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Noise */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1.5">Noise</div>
            <select
              value={noiseType}
              onChange={(e) => setNoiseType(e.target.value as NoiseType)}
              className="w-full text-xs bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-neutral-300"
            >
              <option value="off">Off</option>
              <option value="brown">Brown</option>
              <option value="pink">Pink</option>
            </select>
          </div>

          {/* Texture */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1.5">Texture</div>
            <select
              value={texture ?? ""}
              onChange={(e) => setTexture(e.target.value || null)}
              className="w-full text-xs bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-neutral-300"
            >
              <option value="">Off</option>
              {textures.map((t) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Track */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1.5">Music Track</div>
            <select
              value={trackId ?? ""}
              onChange={(e) => setTrackId(e.target.value || null)}
              className="w-full text-xs bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-neutral-300"
            >
              <option value="">None (noise only)</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>{t.filename}</option>
              ))}
            </select>
          </div>

          {/* Loop mode */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1.5">Loop Mode</div>
            <select
              value={loopMode}
              onChange={(e) => setLoopMode(e.target.value as "auto" | "full")}
              className="w-full text-xs bg-neutral-900 border border-neutral-800 rounded px-2 py-1.5 text-neutral-300"
            >
              <option value="auto">Auto (detected loop points)</option>
              <option value="full">Full track repeat</option>
            </select>
          </div>

          {/* Volumes */}
          <div className="col-span-2">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1.5">Volumes</div>
            <div className="flex flex-col gap-2">
              {(["music", "entrainment", "noise", "texture"] as const).map((layer) => (
                <div key={layer} className="flex items-center gap-3">
                  <span className="text-xs text-neutral-500 w-20 capitalize">
                    {layer.charAt(0).toUpperCase() + layer.slice(1)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={volumes[layer]}
                    onChange={(e) => setVolume(layer, parseFloat(e.target.value))}
                    className="flex-1 accent-neutral-400"
                    aria-label={`${layer} volume`}
                  />
                  <span className="text-[10px] text-neutral-600 font-mono w-7 text-right">
                    {Math.round(volumes[layer] * 100)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Enter Sleep */}
        <div className="flex justify-center">
          <button
            onClick={onEnterSleep}
            className="px-8 py-2.5 text-sm font-medium bg-neutral-100 text-neutral-950 rounded hover:bg-white transition-colors"
          >
            Enter Sleep
          </button>
        </div>
      </div>
    </div>
  );
}
