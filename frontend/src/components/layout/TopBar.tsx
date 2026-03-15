interface TopBarProps {
  onToggleLibrary: () => void;
  onTogglePipeline: () => void;
}

export function TopBar({ onToggleLibrary, onTogglePipeline }: TopBarProps) {
  return (
    <header className="h-12 border-b border-neutral-800 flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-4">
        <span className="text-sm font-semibold tracking-tight text-neutral-100">
          audio engine
        </span>
        <span className="text-xs text-neutral-600 font-mono">v0.1</span>
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
