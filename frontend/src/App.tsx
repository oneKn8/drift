import { Layout } from "./components/layout/Layout";
import { LibraryPanel } from "./components/library/LibraryPanel";
import { WaveformView } from "./components/visualizer/WaveformView";
import { useWebSocket } from "./hooks/useWebSocket";

function App() {
  useWebSocket();

  return (
    <Layout
      sidebar={<LibraryPanel />}
      main={<WaveformView />}
      pipeline={
        <div className="p-4">
          <p className="text-xs text-neutral-500">Pipeline controls</p>
        </div>
      }
    />
  );
}

export default App;
