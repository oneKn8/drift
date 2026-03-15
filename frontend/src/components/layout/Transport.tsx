import { usePlaybackStore } from "../../stores/playback";

export function Transport() {
  const { isPlaying, togglePlay, volume, setVolume, abMode, toggleAB, currentTime, duration } =
    usePlaybackStore();

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="h-14 border-t border-neutral-800 flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="w-8 h-8 flex items-center justify-center rounded-full border border-neutral-700 hover:border-neutral-500 transition-colors"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <rect x="2" y="1" width="3" height="10" rx="0.5" />
              <rect x="7" y="1" width="3" height="10" rx="0.5" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M3 1.5v9l7.5-4.5z" />
            </svg>
          )}
        </button>

        <span className="text-xs font-mono text-neutral-500 w-24">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={toggleAB}
          className={`px-2 py-1 text-xs font-mono rounded transition-colors ${
            abMode === "original"
              ? "bg-neutral-800 text-neutral-300"
              : "bg-neutral-100 text-neutral-900"
          }`}
        >
          {abMode === "original" ? "A (orig)" : "B (proc)"}
        </button>

        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-500">
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.08" />
          </svg>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-20 accent-neutral-100"
          />
        </div>
      </div>
    </div>
  );
}
