import { useState } from "react";
import { useArrangementStore } from "../../stores/arrangement";
import { useLibraryStore } from "../../stores/library";
import { arrangeTrack, detectLoop, renderMix } from "../../hooks/useApi";

export function ArrangeControls() {
  const { tracks: libraryTracks } = useLibraryStore();
  const {
    arrangementId,
    tracks,
    crossfades,
    excluded,
    exportSettings,
    renderStatus,
    setArrangement,
    updateCrossfade,
    setLoop,
    setExportSettings,
    setRenderStatus,
  } = useArrangementStore();

  const [arranging, setArranging] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableIds = libraryTracks
    .map((t) => t.id)
    .filter((id) => !excluded.has(id));

  async function handleArrange() {
    if (availableIds.length < 2) return;
    setArranging(true);
    setError(null);
    try {
      const result = await arrangeTrack(availableIds);
      setArrangement(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Arrangement failed");
    } finally {
      setArranging(false);
    }
  }

  async function handleDetectLoop(trackId: string) {
    setDetecting(true);
    setError(null);
    try {
      const result = await detectLoop(trackId);
      setLoop(trackId, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Loop detection failed");
    } finally {
      setDetecting(false);
    }
  }

  async function handleRender() {
    if (!arrangementId) return;
    setRenderStatus("rendering");
    setError(null);
    try {
      await renderMix(
        arrangementId,
        exportSettings.format,
        exportSettings.sampleRate,
        exportSettings.bitDepth,
        exportSettings.lufsTarget,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Render failed");
      setRenderStatus("idle");
    }
  }

  return (
    <div className="h-full flex flex-col p-3 gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleArrange}
          disabled={availableIds.length < 2 || arranging}
          className="px-3 py-1.5 text-xs font-medium rounded bg-neutral-100 text-neutral-950 hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {arranging ? "Arranging..." : "Auto Arrange"}
        </button>

        {tracks.length > 0 && tracks[0] && (
          <button
            onClick={() => handleDetectLoop(tracks[0])}
            disabled={detecting}
            className="px-3 py-1.5 text-xs font-medium rounded border border-neutral-700 text-neutral-300 hover:border-neutral-500 disabled:opacity-40 transition-colors"
          >
            {detecting ? "Detecting..." : "Find Loops"}
          </button>
        )}

        <div className="flex items-center gap-1 ml-auto">
          <select
            value={exportSettings.format}
            onChange={(e) => setExportSettings({ format: e.target.value as "FLAC" | "WAV" })}
            className="text-xs bg-neutral-900 border border-neutral-800 rounded px-1.5 py-1 text-neutral-300"
          >
            <option value="FLAC">FLAC</option>
            <option value="WAV">WAV</option>
          </select>

          <select
            value={exportSettings.sampleRate}
            onChange={(e) => setExportSettings({ sampleRate: Number(e.target.value) as 44100 | 48000 | 96000 })}
            className="text-xs bg-neutral-900 border border-neutral-800 rounded px-1.5 py-1 text-neutral-300"
          >
            <option value={44100}>44.1kHz</option>
            <option value={48000}>48kHz</option>
            <option value={96000}>96kHz</option>
          </select>

          <select
            value={exportSettings.bitDepth}
            onChange={(e) => setExportSettings({ bitDepth: Number(e.target.value) as 16 | 24 })}
            className="text-xs bg-neutral-900 border border-neutral-800 rounded px-1.5 py-1 text-neutral-300"
          >
            <option value={16}>16-bit</option>
            <option value={24}>24-bit</option>
          </select>

          <button
            onClick={handleRender}
            disabled={!arrangementId || renderStatus === "rendering"}
            className="px-3 py-1.5 text-xs font-medium rounded bg-neutral-100 text-neutral-950 hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {renderStatus === "rendering" ? "Rendering..." : "Render Mix"}
          </button>
        </div>
      </div>

      {crossfades.length > 0 && (
        <div className="flex gap-3 overflow-x-auto">
          {crossfades.map((xf, i) => (
            <div key={i} className="flex items-center gap-1 text-xs text-neutral-500">
              <span className="font-mono whitespace-nowrap">xf{i + 1}</span>
              <input
                type="range"
                min={3}
                max={15}
                step={0.5}
                value={xf.duration_s}
                onChange={(e) => updateCrossfade(i, parseFloat(e.target.value))}
                className="w-16 accent-neutral-400"
              />
              <span className="font-mono w-8">{xf.duration_s.toFixed(1)}s</span>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
