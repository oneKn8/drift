import type { ProcessingStatus } from "../../stores/pipeline";

interface ModelOption {
  value: string;
  label: string;
}

interface StageCardProps {
  name: string;
  model: string;
  status: ProcessingStatus;
  progress: number;
  models: ModelOption[];
  onModelChange: (model: string) => void;
}

const statusColors: Record<ProcessingStatus, string> = {
  idle: "bg-neutral-700",
  processing: "bg-neutral-400 animate-pulse",
  complete: "bg-green-500",
  error: "bg-red-500",
};

const stageLabels: Record<string, string> = {
  analysis: "Analysis",
  separation: "Separation",
  denoise: "Denoise",
  super_resolution: "Super Res",
  mastering: "Mastering",
};

export function StageCard({
  name,
  model,
  status,
  progress,
  models,
  onModelChange,
}: StageCardProps) {
  return (
    <div className="relative border border-neutral-800 rounded p-3 hover:border-neutral-700 transition-colors min-w-[140px] flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wide text-neutral-400">
          {stageLabels[name] ?? name}
        </span>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColors[status]}`} />
      </div>

      <select
        value={model}
        onChange={(e) => onModelChange(e.target.value)}
        disabled={status === "processing"}
        className="w-full text-xs bg-neutral-900 border border-neutral-800 rounded px-1.5 py-1 text-neutral-300 focus:outline-none focus:border-neutral-600 disabled:opacity-50 appearance-none cursor-pointer"
      >
        {models.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-neutral-800 rounded-b overflow-hidden">
        <div
          className="h-full bg-neutral-300 transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
    </div>
  );
}
