import { useEffect, useState } from "react";
import { useLibraryStore } from "../../stores/library";
import { TrackCard } from "./TrackCard";
import { UploadZone } from "./UploadZone";
import { fetchTracks, uploadTrack, deleteTrack } from "../../hooks/useApi";

export function LibraryPanel() {
  const { tracks, setTracks, addTrack, removeTrack, setLoading, loading } =
    useLibraryStore();
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchTracks()
      .then(setTracks)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [setTracks, setLoading]);

  const handleUpload = async (files: File[]) => {
    setUploading(true);
    for (const file of files) {
      try {
        const track = await uploadTrack(file);
        addTrack(track);
      } catch (err) {
        console.error("Upload failed:", err);
      }
    }
    setUploading(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTrack(id);
      removeTrack(id);
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-neutral-800">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
            Library
          </span>
          <span className="text-xs text-neutral-600 font-mono">
            {tracks.length}
          </span>
        </div>
      </div>

      <UploadZone onUpload={handleUpload} uploading={uploading} />

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="text-xs text-neutral-600 text-center py-8">loading...</p>
        ) : tracks.length === 0 ? (
          <p className="text-xs text-neutral-600 text-center py-8">no tracks</p>
        ) : (
          tracks.map((track) => (
            <TrackCard key={track.id} track={track} onDelete={handleDelete} />
          ))
        )}
      </div>
    </div>
  );
}
