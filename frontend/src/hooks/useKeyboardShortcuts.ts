import { useEffect } from "react";
import { useUIStore } from "../stores/ui";
import { usePlaybackStore } from "../stores/playback";
import { useSleepStore } from "../stores/sleep";

export function useKeyboardShortcuts() {
  const { setMainView } = useUIStore();
  const { togglePlay } = usePlaybackStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "Escape": {
          const sleepPhase = useSleepStore.getState().phase;
          if (sleepPhase === "active") {
            // Don't handle here -- SleepActive has its own stop button
            break;
          }
          const { mainView } = useUIStore.getState();
          if (mainView === "sleep") {
            setMainView("waveform");
          }
          break;
        }
        case "1":
          setMainView("waveform");
          break;
        case "2":
          setMainView("timeline");
          break;
        case "3":
          setMainView("sleep");
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setMainView, togglePlay]);
}
