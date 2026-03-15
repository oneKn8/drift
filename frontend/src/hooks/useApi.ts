const API_BASE = "/api";

export async function fetchTracks() {
  const res = await fetch(`${API_BASE}/library`);
  if (!res.ok) throw new Error("Failed to fetch tracks");
  return res.json();
}

export async function uploadTrack(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/library/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(err.detail);
  }
  return res.json();
}

export async function deleteTrack(id: string) {
  const res = await fetch(`${API_BASE}/library/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete track");
  return res.json();
}

export async function runPipeline(
  trackId: string,
  stages?: string[],
  models?: Record<string, string>
) {
  const res = await fetch(`${API_BASE}/pipeline/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ track_id: trackId, stages, models }),
  });
  if (!res.ok) throw new Error("Failed to start pipeline");
  return res.json();
}

export async function getPipelineStatus(trackId: string) {
  const res = await fetch(`${API_BASE}/pipeline/status/${trackId}`);
  if (!res.ok) throw new Error("Pipeline status not found");
  return res.json();
}

export async function arrangeTrack(trackIds: string[]) {
  const res = await fetch(`${API_BASE}/arrange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ track_ids: trackIds }),
  });
  if (!res.ok) throw new Error("Arrangement failed");
  return res.json();
}

export async function detectLoop(trackId: string) {
  const res = await fetch(`${API_BASE}/loop/${trackId}`, { method: "POST" });
  if (!res.ok) throw new Error("Loop detection failed");
  return res.json();
}

export async function renderMix(
  arrangementId: string,
  format: string = "FLAC",
  sampleRate: number = 48000,
  bitDepth: number = 24,
  lufsTarget: number = -14,
) {
  const res = await fetch(`${API_BASE}/mix/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      arrangement_id: arrangementId,
      format,
      sample_rate: sampleRate,
      bit_depth: bitDepth,
      lufs_target: lufsTarget,
    }),
  });
  if (!res.ok) throw new Error("Mix render failed");
  return res.json();
}

export async function getMixStatus(mixId: string) {
  const res = await fetch(`${API_BASE}/mix/status/${mixId}`);
  if (!res.ok) throw new Error("Mix status not found");
  return res.json();
}
