import { useArrangementStore } from "../../stores/arrangement";
import { useLibraryStore } from "../../stores/library";
import { TimelineTrack } from "./TimelineTrack";

export function Timeline() {
  const { tracks: trackIds, crossfades, totalDuration, excluded, toggleExclude } =
    useArrangementStore();
  const { tracks: libraryTracks } = useLibraryStore();

  if (trackIds.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-600 text-sm">
        No arrangement yet. Select tracks and click Auto Arrange.
      </div>
    );
  }

  const getTrack = (id: string) => libraryTracks.find((t) => t.id === id);

  return (
    <div className="flex-1 flex items-center gap-0 px-4 overflow-x-auto min-h-0">
      {trackIds.map((tid, i) => {
        const track = getTrack(tid);
        if (!track) return null;

        const widthPercent = totalDuration > 0
          ? (track.duration / totalDuration) * 100
          : 100 / trackIds.length;

        return (
          <div key={tid} className="flex items-center">
            <TimelineTrack
              track={track}
              widthPercent={widthPercent}
              excluded={excluded.has(tid)}
              onToggleExclude={() => toggleExclude(tid)}
            />
            {i < trackIds.length - 1 && crossfades[i] && (
              <div className="flex-shrink-0 w-8 flex flex-col items-center justify-center">
                <div className="w-px h-8 bg-neutral-700" />
                <span className="text-[9px] text-neutral-600 font-mono">
                  {crossfades[i].duration_s.toFixed(1)}s
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
