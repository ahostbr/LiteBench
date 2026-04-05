import { useEffect, useRef } from "react";

const CHARS =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF";
const FONT_SIZE = 14;
const FADE_ALPHA = 0.05;

export function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let columns: number[] = [];

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const colCount = Math.floor(rect.width / FONT_SIZE);
      // Preserve existing drop positions, fill new columns randomly
      const newColumns = new Array(colCount);
      for (let i = 0; i < colCount; i++) {
        newColumns[i] = columns[i] ?? Math.random() * -100;
      }
      columns = newColumns as number[];
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const draw = () => {
      const rect = canvas.getBoundingClientRect();

      // Fade effect
      ctx.fillStyle = `rgba(0, 0, 0, ${FADE_ALPHA})`;
      ctx.fillRect(0, 0, rect.width, rect.height);

      ctx.font = `${FONT_SIZE}px monospace`;

      for (let i = 0; i < columns.length; i++) {
        const char = CHARS.charAt(Math.floor(Math.random() * CHARS.length));
        const x = i * FONT_SIZE;
        const column = columns[i] ?? 0;
        const y = column * FONT_SIZE;

        // Head character is bright white-green
        if (y > 0) {
          ctx.fillStyle = "#aaffaa";
          ctx.fillText(char, x, y);

          // Trail character slightly behind is full green
          if (y - FONT_SIZE > 0) {
            const trailChar = CHARS.charAt(Math.floor(Math.random() * CHARS.length));
            ctx.fillStyle = "#33ff33";
            ctx.fillText(trailChar, x, y - FONT_SIZE);
          }
        }

        columns[i] = column + 1;

        // Reset when off screen, with random delay
        if (y > rect.height && Math.random() > 0.975) {
          columns[i] = Math.random() * -20;
        }
      }

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0, opacity: 0.7 }}
    />
  );
}
