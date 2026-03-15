import type { Track } from "../../stores/library";
import { usePlaybackStore } from "../../stores/playback";

interface TrackCardProps {
  track: Track;
  onDelete: (id: string) => void;
}

export function TrackCard({ track, onDelete }: TrackCardProps) {
  const { play, currentTrackId } = usePlaybackStore();
  const isActive = currentTrackId === track.id;

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={`group px-3 py-2.5 border-b border-neutral-800/50 cursor-pointer transition-colors ${
        isActive ? "bg-neutral-800/50" : "hover:bg-neutral-900"
      }`}
      onClick={() => play(track.id)}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-neutral-200 truncate">{track.filename}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs font-mono text-neutral-500">
              {track.bpm} bpm
            </span>
            <span className="text-xs font-mono text-neutral-500">
              {track.key}
            </span>
            <span className="text-xs font-mono text-neutral-500">
              {formatDuration(track.duration)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <div
            className="w-1.5 h-4 rounded-full bg-neutral-700"
            style={{ opacity: track.energy }}
            title={`Energy: ${Math.round(track.energy * 100)}%`}
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(track.id);
            }}
            className="p-1 text-neutral-600 hover:text-red-400 transition-colors"
            aria-label="Delete track"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
