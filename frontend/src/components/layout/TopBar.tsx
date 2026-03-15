import { useUIStore } from "../../stores/ui";

interface TopBarProps {
  onToggleLibrary: () => void;
  onTogglePipeline: () => void;
}

export function TopBar({ onToggleLibrary, onTogglePipeline }: TopBarProps) {
  const { mainView, setMainView } = useUIStore();

  return (
    <header className="h-12 border-b border-neutral-800 flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-4">
        <span className="text-sm font-semibold tracking-tight text-neutral-100">
          audio engine
        </span>
        <span className="text-xs text-neutral-600 font-mono">v0.2</span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => setMainView("waveform")}
          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
            mainView === "waveform"
              ? "bg-neutral-800 text-neutral-100"
              : "text-neutral-500 hover:text-neutral-300"
          }`}
        >
          Waveform
        </button>
        <button
          onClick={() => setMainView("timeline")}
          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
            mainView === "timeline"
              ? "bg-neutral-800 text-neutral-100"
              : "text-neutral-500 hover:text-neutral-300"
          }`}
        >
          Timeline
        </button>
        <button
          onClick={() => setMainView("sleep")}
          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
            mainView === "sleep"
              ? "bg-neutral-800 text-neutral-100"
              : "text-neutral-500 hover:text-neutral-300"
          }`}
        >
          Sleep
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onToggleLibrary}
          className="px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 rounded transition-colors"
        >
          Library
        </button>
        <button
          onClick={onTogglePipeline}
          className="px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 rounded transition-colors"
        >
          Pipeline
        </button>
        <button className="px-3 py-1.5 text-xs font-medium bg-neutral-100 text-neutral-900 rounded hover:bg-neutral-200 transition-colors">
          Export
        </button>
      </div>
    </header>
  );
}
