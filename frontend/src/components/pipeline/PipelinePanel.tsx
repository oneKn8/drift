import { useState } from "react";
import { motion } from "framer-motion";
import { usePipelineStore } from "../../stores/pipeline";
import { usePlaybackStore } from "../../stores/playback";
import { runPipeline } from "../../hooks/useApi";
import { StageCard } from "./StageCard";
import { SpectralWaterfall } from "../visualizer/SpectralWaterfall";

const stageModels: Record<string, { value: string; label: string }[]> = {
  denoise: [{ value: "deepfilternet", label: "DeepFilterNet" }],
  separate: [
    { value: "htdemucs", label: "HTDemucs" },
    { value: "htdemucs_ft", label: "HTDemucs (Fine-tuned)" },
  ],
  super_resolution: [{ value: "flashsr", label: "FlashSR" }],
  master: [{ value: "matchering", label: "Matchering" }],
};

export function PipelinePanel() {
  const { stages, setStageModel } = usePipelineStore();
  const { currentTrackId } = usePlaybackStore();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isProcessing =
    running || stages.some((s) => s.status === "processing");

  async function handleEnhance() {
    if (!currentTrackId || isProcessing) return;

    const models: Record<string, string> = {};
    for (const stage of stages) {
      models[stage.name] = stage.model;
    }

    setError(null);
    setRunning(true);
    try {
      await runPipeline(currentTrackId, undefined, models);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pipeline failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="h-full flex flex-col p-3 gap-2">
      <div className="h-16 rounded overflow-hidden border border-neutral-800 mb-2">
        <SpectralWaterfall analyserNode={null} />
      </div>
      <div className="flex items-center gap-2 flex-1 min-h-0">
        <div className="flex gap-2 flex-1 overflow-x-auto">
          {stages.map((stage) => (
            <StageCard
              key={stage.name}
              name={stage.name}
              model={stage.model}
              status={stage.status}
              progress={stage.progress}
              models={stageModels[stage.name] ?? []}
              onModelChange={(model) => setStageModel(stage.name, model)}
            />
          ))}
        </div>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleEnhance}
          disabled={!currentTrackId || isProcessing}
          className="px-4 py-2 text-sm font-medium rounded bg-neutral-100 text-neutral-950 hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0 self-center"
        >
          {isProcessing ? "Processing..." : "Enhance"}
        </motion.button>
      </div>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
