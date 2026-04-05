/**
 * Matrix Digital Rain Effect (from Kuroryuu)
 *
 * Authentic Matrix-style falling code animation.
 * Only renders when Matrix theme is active.
 * Uses half-width katakana + numbers like the original film.
 * Opacity controlled via theme store matrixRainOpacity (0-100).
 */
import { useEffect, useRef } from 'react';
import { useThemeStore } from '@/stores/theme-store';

const MATRIX_CHARS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

interface Drop {
  x: number;
  y: number;
  speed: number;
  chars: string[];
  length: number;
}

export function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeTheme = useThemeStore((s) => s.activeTheme);
  const rainOpacity = useThemeStore((s) => s.matrixRainOpacity);
  const reduceMotion = useThemeStore((s) => s.reduceMotion);
  const animationRef = useRef<number | undefined>(undefined);
  const dropsRef = useRef<Drop[]>([]);
  const isMatrix = activeTheme === 'matrix';

  useEffect(() => {
    if (!isMatrix || reduceMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let logicalWidth = window.innerWidth;
    let logicalHeight = window.innerHeight;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      logicalWidth = window.innerWidth;
      logicalHeight = window.innerHeight;
      canvas.width = logicalWidth * dpr;
      canvas.height = logicalHeight * dpr;
      canvas.style.width = `${logicalWidth}px`;
      canvas.style.height = `${logicalHeight}px`;
      ctx.scale(dpr, dpr);
      initDrops();
    };

    const initDrops = () => {
      const columns = Math.floor(logicalWidth / 20);
      dropsRef.current = [];
      for (let i = 0; i < columns; i++) {
        dropsRef.current.push(createDrop(i * 20));
      }
    };

    const createDrop = (x: number): Drop => {
      const length = Math.floor(Math.random() * 15) + 5;
      const chars: string[] = [];
      for (let i = 0; i < length; i++) {
        chars.push(MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]);
      }
      return {
        x,
        y: Math.random() * -500,
        speed: Math.random() * 2 + 1,
        chars,
        length,
      };
    };

    const animate = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, logicalWidth, logicalHeight);
      ctx.font = '15px monospace';

      dropsRef.current.forEach((drop, index) => {
        drop.chars.forEach((char, charIndex) => {
          const y = drop.y - charIndex * 20;

          if (y > 0 && y < logicalHeight) {
            if (charIndex === 0) {
              ctx.fillStyle = '#FFFFFF';
            } else if (charIndex < 3) {
              ctx.fillStyle = '#00FF41';
            } else {
              const alpha = Math.max(0.1, 1 - (charIndex / drop.length));
              ctx.fillStyle = `rgba(0, 255, 65, ${alpha})`;
            }
            ctx.fillText(char, drop.x, y);
          }

          if (Math.random() < 0.02) {
            drop.chars[charIndex] = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
          }
        });

        drop.y += drop.speed;

        if (drop.y - drop.length * 20 > logicalHeight) {
          dropsRef.current[index] = createDrop(drop.x);
        }
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    resize();
    window.addEventListener('resize', resize);
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isMatrix, reduceMotion]);

  if (!isMatrix || reduceMotion) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ opacity: (rainOpacity ?? 40) / 100, zIndex: 1 }}
    />
  );
}
