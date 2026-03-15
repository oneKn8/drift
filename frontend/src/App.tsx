import { Layout } from "./components/layout/Layout";
import { LibraryPanel } from "./components/library/LibraryPanel";
import { PipelinePanel } from "./components/pipeline/PipelinePanel";
import { WaveformView } from "./components/visualizer/WaveformView";
import { useWebSocket } from "./hooks/useWebSocket";

function App() {
  useWebSocket();

  return (
    <Layout
      sidebar={<LibraryPanel />}
      main={<WaveformView />}
      pipeline={<PipelinePanel />}
    />
  );
}

export default App;
