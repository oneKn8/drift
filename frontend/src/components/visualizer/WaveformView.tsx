import { useRef } from "react";
import { useAudioPlayer } from "../../hooks/useAudioPlayer";
import { usePlaybackStore } from "../../stores/playback";
import { TerrainVisualizer } from "./TerrainVisualizer";

export function WaveformView() {
  const containerRef = useRef<HTMLDivElement>(null);
  useAudioPlayer(containerRef);
  const { currentTrackId } = usePlaybackStore();

  return (
    <div className="h-full flex flex-col relative">
      <TerrainVisualizer analyserNode={null} />
      {!currentTrackId ? (
        <div className="flex-1 flex items-center justify-center relative z-10">
          <p className="text-neutral-600 text-sm font-mono">
            select a track from the library
          </p>
        </div>
      ) : (
        <div className="flex-1 px-4 py-2 relative z-10">
          <div ref={containerRef} className="h-full" />
        </div>
      )}
    </div>
  );
}
