import { motion, AnimatePresence } from "framer-motion";
import { TopBar } from "./TopBar";
import { Transport } from "./Transport";
import { useUIStore } from "../../stores/ui";

interface LayoutProps {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  pipeline?: React.ReactNode;
  timeline?: React.ReactNode;
  arrangeControls?: React.ReactNode;
  sleep?: React.ReactNode;
}

export function Layout({ sidebar, main, pipeline, timeline, arrangeControls, sleep }: LayoutProps) {
  const { mainView, openPanels, togglePanel } = useUIStore();
  const showLibrary = openPanels.has("library");
  const showPipeline = openPanels.has("pipeline");

  const isTimeline = mainView === "timeline";
  const isSleep = mainView === "sleep";

  return (
    <div className="h-screen flex flex-col bg-neutral-950 text-neutral-100 overflow-hidden">
      <TopBar
        onToggleLibrary={() => togglePanel("library")}
        onTogglePipeline={() => togglePanel("pipeline")}
      />

      <div className="flex flex-1 min-h-0">
        <AnimatePresence>
          {showLibrary && (
            <motion.aside
              key="library-sidebar"
              initial={{ x: -288 }}
              animate={{ x: 0 }}
              exit={{ x: -288 }}
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
              className="w-72 border-r border-neutral-800 flex-shrink-0 overflow-y-auto"
            >
              {sidebar}
            </motion.aside>
          )}
        </AnimatePresence>

        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-0">
            {isSleep ? sleep : isTimeline ? timeline : main}
          </div>

          <AnimatePresence>
            {showPipeline && !isTimeline && !isSleep && pipeline && (
              <motion.div
                key="pipeline-panel"
                initial={{ y: 192 }}
                animate={{ y: 0 }}
                exit={{ y: 192 }}
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
                className="border-t border-neutral-800 h-48 flex-shrink-0 overflow-y-auto"
              >
                {pipeline}
              </motion.div>
            )}

            {isTimeline && arrangeControls && (
              <motion.div
                key="arrange-panel"
                initial={{ y: 192 }}
                animate={{ y: 0 }}
                exit={{ y: 192 }}
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
                className="border-t border-neutral-800 h-32 flex-shrink-0 overflow-y-auto"
              >
                {arrangeControls}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      <Transport />
    </div>
  );
}
