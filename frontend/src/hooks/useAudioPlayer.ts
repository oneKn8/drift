import { useEffect, useRef, useCallback } from "react";
import WaveSurfer from "wavesurfer.js";
import { usePlaybackStore } from "../stores/playback";
import { useLibraryStore } from "../stores/library";

export function useAudioPlayer(containerRef: React.RefObject<HTMLDivElement | null>) {
  const wsRef = useRef<WaveSurfer | null>(null);
  const { isPlaying, currentTrackId, volume, setCurrentTime, setDuration, pause } =
    usePlaybackStore();
  const { tracks } = useLibraryStore();

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
    const url = `/audio/uploads/${currentTrack.file_path}`;
    wsRef.current.load(url);
  }, [currentTrack]);

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
