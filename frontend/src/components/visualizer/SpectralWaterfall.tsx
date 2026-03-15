import { useEffect, useRef } from "react";

interface SpectralWaterfallProps {
  analyserNode: AnalyserNode | null;
}

function intensityToColor(value: number): [number, number, number] {
  // 0-255 input -> RGB
  const t = value / 255;
  if (t < 0.3) {
    // Black to neutral-700 (64,64,64)
    const s = t / 0.3;
    return [Math.floor(s * 64), Math.floor(s * 64), Math.floor(s * 64)];
  }
  if (t < 0.7) {
    // neutral-700 to neutral-300 (212,212,212)
    const s = (t - 0.3) / 0.4;
    return [
      Math.floor(64 + s * 148),
      Math.floor(64 + s * 148),
      Math.floor(64 + s * 148),
    ];
  }
  // neutral-300 to white
  const s = (t - 0.7) / 0.3;
  return [
    Math.floor(212 + s * 43),
    Math.floor(212 + s * 43),
    Math.floor(212 + s * 43),
  ];
}

export function SpectralWaterfall({ analyserNode }: SpectralWaterfallProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Offscreen canvas for scrolling (shift content down)
    const offscreen = document.createElement("canvas");
    offscreenRef.current = offscreen;

    const fftSize = 256;
    const fftData = new Uint8Array(fftSize / 2);
    let noiseOffset = 0;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.floor(canvas!.clientWidth * dpr);
      const h = Math.floor(canvas!.clientHeight * dpr);
      if (canvas!.width !== w || canvas!.height !== h) {
        // Save current content
        offscreen.width = w;
        offscreen.height = h;
        const offCtx = offscreen.getContext("2d")!;
        offCtx.drawImage(canvas!, 0, 0);
        canvas!.width = w;
        canvas!.height = h;
        ctx!.drawImage(offscreen, 0, 0);
      }
    }

    function render() {
      if (!canvas || !ctx) return;
      resize();

      const w = canvas.width;
      const h = canvas.height;

      // Shift existing content down by 1 pixel
      const offCtx = offscreen.getContext("2d")!;
      offscreen.width = w;
      offscreen.height = h;
      offCtx.drawImage(canvas, 0, 0);
      ctx.drawImage(offscreen, 0, 1);

      // Get frequency data
      if (analyserNode) {
        analyserNode.fftSize = fftSize;
        analyserNode.getByteFrequencyData(fftData);
      } else {
        // Subtle noise pattern when idle
        noiseOffset += 0.02;
        for (let i = 0; i < fftData.length; i++) {
          fftData[i] = Math.floor(
            (Math.sin(i * 0.1 + noiseOffset) * 0.5 + 0.5) * 30 +
              Math.random() * 10,
          );
        }
      }

      // Draw top row
      const binWidth = w / fftData.length;
      for (let i = 0; i < fftData.length; i++) {
        const [r, g, b] = intensityToColor(fftData[i]);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(Math.floor(i * binWidth), 0, Math.ceil(binWidth) + 1, 1);
      }

      animRef.current = requestAnimationFrame(render);
    }

    animRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [analyserNode]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ background: "#0a0a0a" }}
    />
  );
}
