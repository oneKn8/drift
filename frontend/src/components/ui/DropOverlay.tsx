import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { uploadTrack } from "../../hooks/useApi";
import { useLibraryStore } from "../../stores/library";
import { useToastStore } from "../../stores/toast";

export function DropOverlay() {
  const [isDragging, setIsDragging] = useState(false);
  const { addTrack } = useLibraryStore();
  const dragCounterRef = useRef<number>(0);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer?.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragging(false);

      const files = e.dataTransfer?.files;
      if (!files) return;

      for (const file of Array.from(files)) {
        try {
          const track = await uploadTrack(file);
          addTrack(track);
          useToastStore.getState().addToast("success", `Uploaded ${file.name}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Upload failed";
          useToastStore.getState().addToast("error", msg);
        }
      }
    },
    [addTrack],
  );

  useEffect(() => {
    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  return (
    <AnimatePresence>
      {isDragging && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-neutral-950/90 backdrop-blur-sm"
        >
          <div className="border-2 border-dashed border-neutral-600 rounded-lg px-12 py-8">
            <p className="text-sm text-neutral-400">
              Drop audio files to upload
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
