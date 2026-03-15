import { Layout } from "./components/layout/Layout";
import { LibraryPanel } from "./components/library/LibraryPanel";
import { PipelinePanel } from "./components/pipeline/PipelinePanel";
import { WaveformView } from "./components/visualizer/WaveformView";
import { Timeline } from "./components/timeline/Timeline";
import { ArrangeControls } from "./components/timeline/ArrangeControls";
import { SleepView } from "./components/sleep/SleepView";
import { ToastContainer } from "./components/ui/ToastContainer";
import { DropOverlay } from "./components/ui/DropOverlay";
import { useWebSocket } from "./hooks/useWebSocket";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";

function App() {
  useWebSocket();
  useKeyboardShortcuts();

  return (
    <>
      <Layout
        sidebar={<LibraryPanel />}
        main={<WaveformView />}
        pipeline={<PipelinePanel />}
        timeline={<Timeline />}
        arrangeControls={<ArrangeControls />}
        sleep={<SleepView />}
      />
      <ToastContainer />
      <DropOverlay />
    </>
  );
}

export default App;
