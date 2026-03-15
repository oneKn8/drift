import type { Track } from "../../stores/library";

interface TimelineTrackProps {
  track: Track;
  widthPercent: number;
  excluded: boolean;
  onToggleExclude: () => void;
}

export function TimelineTrack({
  track,
  widthPercent,
  excluded,
  onToggleExclude,
}: TimelineTrackProps) {
  return (
    <div
      className={`relative h-14 rounded border transition-colors flex-shrink-0 ${
        excluded
          ? "border-neutral-800 opacity-30"
          : "border-neutral-700 hover:border-neutral-600"
      }`}
      style={{ width: `${widthPercent}%`, minWidth: "80px" }}
    >
      <div
        className="absolute inset-0 rounded bg-neutral-800"
        style={{ width: `${Math.round(track.energy * 100)}%`, opacity: 0.4 }}
      />

      <div className="relative p-2 flex flex-col justify-between h-full">
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-300 truncate max-w-[80%]">
            {track.filename}
          </span>
          <button
            onClick={onToggleExclude}
            className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
            aria-label={excluded ? "Include track" : "Exclude track"}
          >
            {excluded ? "+" : "x"}
          </button>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-neutral-500 font-mono">
          <span>{Math.floor(track.duration / 60)}:{String(Math.floor(track.duration % 60)).padStart(2, "0")}</span>
          <span>{track.bpm.toFixed(0)} bpm</span>
          <span>{track.key}</span>
        </div>
      </div>
    </div>
  );
}
