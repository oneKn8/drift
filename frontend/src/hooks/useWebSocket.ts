import { useEffect, useRef, useCallback } from "react";
import { usePipelineStore } from "../stores/pipeline";
import { useArrangementStore } from "../stores/arrangement";

type WSMessage = {
  type: string;
  [key: string]: unknown;
};

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { setStageStatus, markTrackComplete } = usePipelineStore();
  const { setRenderStatus } = useArrangementStore();

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "ping" }));
    };

    ws.onmessage = (event) => {
      const data: WSMessage = JSON.parse(event.data);

      if (data.type === "progress") {
        const stage = data.stage as string;
        const status = data.status as string;
        const progress = data.progress as number;

        if (stage === "mix_render") {
          if (status === "complete") {
            setRenderStatus("complete");
          } else if (status === "processing") {
            setRenderStatus("rendering");
          }
        } else {
          setStageStatus(
            stage,
            status as "idle" | "processing" | "complete" | "error",
            progress
          );

          if (stage === "pipeline" && status === "complete") {
            const trackId = data.track_id as string | undefined;
            if (trackId) {
              markTrackComplete(trackId);
            }
          }
        }
      }
    };

    ws.onclose = () => {
      reconnectTimeout.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [setStageStatus, markTrackComplete, setRenderStatus]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimeout.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((message: WSMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { send };
}
