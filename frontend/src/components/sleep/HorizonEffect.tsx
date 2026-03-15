import { useEffect, useRef } from "react";

interface HorizonEffectProps {
  onComplete: () => void;
}

export function HorizonEffect({ onComplete }: HorizonEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const duration = 4000;
    const start = performance.now();
    const midY = canvas.height / 2;
    const baseAmplitude = canvas.height * 0.15;
    const points = 200;

    function draw(now: number) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);

      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      ctx!.fillStyle = "#000000";
      ctx!.fillRect(0, 0, canvas!.width, canvas!.height);

      if (t < 0.375) {
        const compress = 1 - t / 0.375;
        const amplitude = baseAmplitude * compress;

        ctx!.beginPath();
        ctx!.strokeStyle = `rgba(115, 115, 115, ${0.6 + compress * 0.4})`;
        ctx!.lineWidth = 1.5;

        for (let i = 0; i <= points; i++) {
          const x = (i / points) * canvas!.width;
          const wave =
            Math.sin(i * 0.15) * amplitude +
            Math.sin(i * 0.08 + 1) * amplitude * 0.5;
          const y = midY + wave;
          if (i === 0) ctx!.moveTo(x, y);
          else ctx!.lineTo(x, y);
        }
        ctx!.stroke();
      } else if (t < 0.75) {
        const pulseT = (t - 0.375) / 0.375;
        const pulse = Math.sin(pulseT * Math.PI * 2) * 0.5 + 0.5;
        const glow = pulse * 20;
        const alpha = 0.4 + pulse * 0.6;

        ctx!.beginPath();
        ctx!.moveTo(0, midY);
        ctx!.lineTo(canvas!.width, midY);
        ctx!.strokeStyle = `rgba(115, 115, 115, ${alpha})`;
        ctx!.lineWidth = 1.5;
        ctx!.shadowColor = `rgba(115, 115, 115, ${alpha * 0.5})`;
        ctx!.shadowBlur = glow;
        ctx!.stroke();
        ctx!.shadowBlur = 0;
      } else {
        const fadeT = (t - 0.75) / 0.25;
        const alpha = (1 - fadeT) * 0.4;

        if (alpha > 0.01) {
          ctx!.beginPath();
          ctx!.moveTo(0, midY);
          ctx!.lineTo(canvas!.width, midY);
          ctx!.strokeStyle = `rgba(115, 115, 115, ${alpha})`;
          ctx!.lineWidth = 1.5;
          ctx!.stroke();
        }
      }

      if (t < 1) {
        requestAnimationFrame(draw);
      } else {
        onComplete();
      }
    }

    requestAnimationFrame(draw);
  }, [onComplete]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-50"
      style={{ background: "#000000" }}
    />
  );
}
