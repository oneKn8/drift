import { Layout } from "./components/layout/Layout";

function App() {
  return (
    <Layout
      sidebar={
        <div className="p-4">
          <p className="text-xs text-neutral-500">Library</p>
        </div>
      }
      main={
        <div className="flex items-center justify-center h-full">
          <p className="text-neutral-600 text-sm font-mono">
            drop audio files here
          </p>
        </div>
      }
      pipeline={
        <div className="p-4">
          <p className="text-xs text-neutral-500">Pipeline</p>
        </div>
      }
    />
  );
}

export default App;
