import { Layout } from "./components/layout/Layout";
import { LibraryPanel } from "./components/library/LibraryPanel";

function App() {
  return (
    <Layout
      sidebar={<LibraryPanel />}
      main={
        <div className="flex items-center justify-center h-full">
          <p className="text-neutral-600 text-sm font-mono">
            drop audio files here
          </p>
        </div>
      }
      pipeline={
        <div className="p-4">
          <p className="text-xs text-neutral-500">Pipeline controls</p>
        </div>
      }
    />
  );
}

export default App;
