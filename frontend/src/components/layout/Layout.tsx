import { TopBar } from "./TopBar";
import { Transport } from "./Transport";
import { useUIStore } from "../../stores/ui";

interface LayoutProps {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  pipeline?: React.ReactNode;
  timeline?: React.ReactNode;
  arrangeControls?: React.ReactNode;
}

export function Layout({ sidebar, main, pipeline, timeline, arrangeControls }: LayoutProps) {
  const { mainView, openPanels, togglePanel } = useUIStore();
  const showLibrary = openPanels.has("library");
  const showPipeline = openPanels.has("pipeline");

  const isTimeline = mainView === "timeline";

  return (
    <div className="h-screen flex flex-col bg-neutral-950 text-neutral-100 overflow-hidden">
      <TopBar
        onToggleLibrary={() => togglePanel("library")}
        onTogglePipeline={() => togglePanel("pipeline")}
      />

      <div className="flex flex-1 min-h-0">
        {showLibrary && (
          <aside className="w-72 border-r border-neutral-800 flex-shrink-0 overflow-y-auto">
            {sidebar}
          </aside>
        )}

        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-0">
            {isTimeline ? timeline : main}
          </div>

          {showPipeline && !isTimeline && pipeline && (
            <div className="border-t border-neutral-800 h-48 flex-shrink-0 overflow-y-auto">
              {pipeline}
            </div>
          )}

          {isTimeline && arrangeControls && (
            <div className="border-t border-neutral-800 h-32 flex-shrink-0 overflow-y-auto">
              {arrangeControls}
            </div>
          )}
        </main>
      </div>

      <Transport />
    </div>
  );
}
