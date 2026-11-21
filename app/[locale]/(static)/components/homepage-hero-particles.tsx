"use client";

import { useEffect, useRef } from "react";

import { reportApplicationError } from "@/core/errors/report-application-error";

export const PARTICLES_IDLE_FALLBACK_MS = 200;

function whenIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(callback, { timeout: 2_000 });
    return () => window.cancelIdleCallback(handle);
  }

  const handle = window.setTimeout(callback, PARTICLES_IDLE_FALLBACK_MS);
  return () => window.clearTimeout(handle);
}

export function HomepageHeroParticles({ className, mark = true }: { className?: string; mark?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let stop: (() => void) | undefined;
    let cancelIdle: (() => void) | undefined;

    function begin() {
      cancelIdle = whenIdle(() => {
        void import("./homepage-hero-particles-engine")
          .then(({ startHeroParticles }) => {
            if (!cancelled && canvas) stop = startHeroParticles(canvas);
          })
          .catch(reportApplicationError);
      });
    }

    if (document.readyState === "complete") begin();
    else window.addEventListener("load", begin, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", begin);
      cancelIdle?.();
      stop?.();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      data-homepage-hero-particles=""
      data-particle-mark={mark ? undefined : "off"}
    />
  );
}
