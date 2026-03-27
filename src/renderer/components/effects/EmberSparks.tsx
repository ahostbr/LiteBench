import React, { useEffect, useRef } from "react";

const MAX_SPARKS = 60;

export interface EmberSparksProps {
  particleDensity: number;
  particleSpeed: number;
  particleLifespan: number;
  reduceMotion: boolean;
}

export function EmberSparks({
  particleDensity,
  particleSpeed,
  particleLifespan,
  reduceMotion,
}: EmberSparksProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sparkCount = useRef(0);

  useEffect(() => {
    if (reduceMotion || particleDensity === 0) return;

    const baseInterval = Math.max(100, 3000 / (particleDensity / 25));
    const baseLifetime = (particleLifespan * 1000) / particleSpeed;
    let cancelled = false;

    function scheduleNext() {
      if (cancelled) return;
      const jitter = 0.3 + Math.random() * 2.2;
      const nextDelay = Math.round(baseInterval * jitter);

      setTimeout(() => {
        if (cancelled) return;
        const container = containerRef.current;
        if (!container || sparkCount.current >= MAX_SPARKS) {
          scheduleNext();
          return;
        }

        const burstCount = Math.random() < 0.15 ? Math.floor(2 + Math.random() * 2) : 1;

        for (let i = 0; i < burstCount && sparkCount.current < MAX_SPARKS; i++) {
          const spark = document.createElement("div");
          spark.className = "ember-spark";
          spark.style.left = `${Math.random() * 100}%`;
          spark.style.bottom = `${Math.random() * 40}%`;
          spark.style.opacity = `${0.3 + Math.random() * 0.7}`;
          const size = 1.5 + Math.random() * 3;
          spark.style.width = spark.style.height = `${size}px`;

          const lifetimeJitter = 0.6 + Math.random() * 0.8;
          const thisLifetime = Math.round(baseLifetime * lifetimeJitter);
          spark.style.setProperty("--spark-duration", `${(thisLifetime / 1000).toFixed(1)}s`);

          if (i > 0) {
            spark.style.animationDelay = `${(Math.random() * 0.3).toFixed(2)}s`;
          }

          container.appendChild(spark);
          sparkCount.current++;

          setTimeout(
            () => {
              spark.remove();
              sparkCount.current--;
            },
            thisLifetime + (i > 0 ? 300 : 0),
          );
        }

        scheduleNext();
      }, nextDelay);
    }

    scheduleNext();

    return () => {
      cancelled = true;
    };
  }, [particleDensity, particleSpeed, particleLifespan, reduceMotion]);

  if (reduceMotion || particleDensity === 0) return null;

  return (
    <div ref={containerRef} className="fixed inset-0 pointer-events-none z-10 overflow-hidden" />
  );
}
