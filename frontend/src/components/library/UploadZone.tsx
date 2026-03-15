import { useCallback, useState } from "react";

interface UploadZoneProps {
  onUpload: (files: File[]) => void;
  uploading: boolean;
}

export function UploadZone({ onUpload, uploading }: UploadZoneProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        /\.(mp3|wav|flac|ogg|m4a|aac)$/i.test(f.name)
      );
      if (files.length) onUpload(files);
    },
    [onUpload]
  );

  const handleClick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "audio/*";
    input.onchange = () => {
      if (input.files) onUpload(Array.from(input.files));
    };
    input.click();
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={handleClick}
      className={`mx-3 my-2 p-4 border border-dashed rounded cursor-pointer transition-colors ${
        dragOver
          ? "border-neutral-400 bg-neutral-800/30"
          : "border-neutral-800 hover:border-neutral-600"
      }`}
    >
      <p className="text-xs text-neutral-500 text-center">
        {uploading ? "uploading..." : "drop files or click"}
      </p>
    </div>
  );
}
