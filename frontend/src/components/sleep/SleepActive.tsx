import { useState, useEffect, useRef } from "react";
import { useSleepStore, PRESETS } from "../../stores/sleep";

interface SleepActiveProps {
  onStop: () => void;
  onDismissAlarm: () => void;
}

export function SleepActive({ onStop, onDismissAlarm }: SleepActiveProps) {
  const [showOverlay, setShowOverlay] = useState(false);
  const [cursorHidden, setCursorHidden] = useState(false);
  const [clockStr, setClockStr] = useState("");
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cursorTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { timerRemaining, timerDuration, currentFreq, preset, audioMode, alarmEnabled } =
    useSleepStore();

  // Clock
  useEffect(() => {
    function updateClock() {
      const d = new Date();
      setClockStr(`${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`);
    }
    updateClock();
    const interval = setInterval(updateClock, 10000);
    return () => clearInterval(interval);
  }, []);

  // Auto-hide cursor
  useEffect(() => {
    cursorTimeout.current = setTimeout(() => setCursorHidden(true), 2000);
    return () => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
      if (cursorTimeout.current) clearTimeout(cursorTimeout.current);
    };
  }, []);

  function handleInteraction() {
    setShowOverlay(true);
    setCursorHidden(false);
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => setShowOverlay(false), 5000);
    if (cursorTimeout.current) clearTimeout(cursorTimeout.current);
    cursorTimeout.current = setTimeout(() => setCursorHidden(true), 2000);
  }

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const freqLabel =
    currentFreq > 0
      ? `${currentFreq.toFixed(1)} Hz ${currentFreq > 8 ? "alpha" : currentFreq > 4 ? "theta" : "delta"}`
      : "";

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center"
      style={{ background: "#000000", cursor: cursorHidden ? "none" : "default" }}
      onClick={handleInteraction}
      onMouseMove={handleInteraction}
    >
      <div
        className="flex flex-col items-center gap-6 transition-opacity duration-500"
        style={{ opacity: showOverlay ? 1 : 0 }}
      >
        <div className="text-5xl font-extralight tracking-tight tabular-nums" style={{ color: "#404040" }}>
          {clockStr}
        </div>

        {timerDuration > 0 && (
          <div className="text-sm font-mono" style={{ color: "#333" }}>
            {formatTime(timerRemaining)} remaining
          </div>
        )}

        <div className="flex gap-4 text-xs" style={{ color: "#333" }}>
          <span>{PRESETS[preset]?.label ?? preset}</span>
          {freqLabel && <span>{freqLabel}</span>}
          <span>{audioMode === "headphones" ? "Headphones" : "Speakers"}</span>
        </div>

        <div className="flex gap-4 items-center">
          <button
            onClick={(e) => { e.stopPropagation(); onStop(); }}
            className="px-5 py-2 text-xs rounded transition-colors"
            style={{ border: "1px solid #333", color: "#404040" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#525252"; e.currentTarget.style.color = "#737373"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#333"; e.currentTarget.style.color = "#404040"; }}
          >
            Stop
          </button>
          {alarmEnabled && timerRemaining === 0 && timerDuration > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onDismissAlarm(); }}
              className="px-5 py-2 text-xs rounded transition-colors"
              style={{ border: "1px solid #333", color: "#404040" }}
            >
              Dismiss Alarm
            </button>
          )}
        </div>
      </div>

      <div
        className="absolute bottom-10 text-[10px] transition-opacity duration-500"
        style={{ color: "#1a1a1a", opacity: showOverlay ? 0 : 1 }}
      >
        tap anywhere to show controls
      </div>
    </div>
  );
}
