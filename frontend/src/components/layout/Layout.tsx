import { TopBar } from "./TopBar";
import { Transport } from "./Transport";
import { useUIStore } from "../../stores/ui";

interface LayoutProps {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  pipeline?: React.ReactNode;
}

export function Layout({ sidebar, main, pipeline }: LayoutProps) {
  const { openPanels, togglePanel } = useUIStore();
  const showLibrary = openPanels.has("library");
  const showPipeline = openPanels.has("pipeline");

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
          <div className="flex-1 min-h-0">{main}</div>

          {showPipeline && pipeline && (
            <div className="border-t border-neutral-800 h-48 flex-shrink-0 overflow-y-auto">
              {pipeline}
            </div>
          )}
        </main>
      </div>

      <Transport />
    </div>
  );
}
