import { useEffect, useRef, useCallback } from "react";
import WaveSurfer from "wavesurfer.js";
import { usePlaybackStore } from "../stores/playback";
import { useLibraryStore } from "../stores/library";
import { usePipelineStore } from "../stores/pipeline";

export function useAudioPlayer(containerRef: React.RefObject<HTMLDivElement | null>) {
  const wsRef = useRef<WaveSurfer | null>(null);
  const { isPlaying, currentTrackId, volume, abMode, setCurrentTime, setDuration, pause } =
    usePlaybackStore();
  const { tracks } = useLibraryStore();
  const { isTrackComplete } = usePipelineStore();

  const currentTrack = tracks.find((t) => t.id === currentTrackId);

  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#404040",
      progressColor: "#e5e5e5",
      cursorColor: "#737373",
      cursorWidth: 1,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      height: "auto",
      normalize: true,
      backend: "WebAudio",
    });

    ws.on("timeupdate", (time) => setCurrentTime(time));
    ws.on("ready", () => setDuration(ws.getDuration()));
    ws.on("finish", () => pause());

    wsRef.current = ws;

    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  }, [containerRef, setCurrentTime, setDuration, pause]);

  useEffect(() => {
    if (!wsRef.current || !currentTrack) return;

    let url: string;

    if (abMode === "processed" && currentTrack.id && isTrackComplete(currentTrack.id)) {
      // Try mastered first, fall back to denoised, then original
      const masteredUrl = `/audio/enhanced/${currentTrack.id}/master/mastered.wav`;
      const denoisedUrl = `/audio/enhanced/${currentTrack.id}/denoise/denoised.wav`;

      const ws = wsRef.current;
      fetch(masteredUrl, { method: "HEAD" })
        .then((res) => {
          if (res.ok) {
            ws.load(masteredUrl);
          } else {
            return fetch(denoisedUrl, { method: "HEAD" }).then((res2) => {
              if (res2.ok) {
                ws.load(denoisedUrl);
              } else {
                ws.load(`/audio/uploads/${currentTrack.file_path}`);
              }
            });
          }
        })
        .catch(() => {
          ws.load(`/audio/uploads/${currentTrack.file_path}`);
        });
      return;
    }

    url = `/audio/uploads/${currentTrack.file_path}`;
    wsRef.current.load(url);
  }, [currentTrack, abMode, isTrackComplete]);

  useEffect(() => {
    if (!wsRef.current) return;
    if (isPlaying) {
      wsRef.current.play().catch(() => {});
    } else {
      wsRef.current.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!wsRef.current) return;
    wsRef.current.setVolume(volume);
  }, [volume]);

  const seekTo = useCallback((progress: number) => {
    if (!wsRef.current) return;
    wsRef.current.seekTo(progress);
  }, []);

  return { wavesurfer: wsRef, seekTo };
}
