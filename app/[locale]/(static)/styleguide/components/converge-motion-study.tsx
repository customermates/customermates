"use client";

import type { BrandIllustrationBrief, VisualLocale } from "@/components/marketing/visuals/visual-contract";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, RotateCcw } from "lucide-react";

import { StoryVisual } from "@/components/marketing/visuals/story-visual";
import { cn } from "@/core/utils/cn";

const MOTION_DURATION_MS = 4_800;
const MOTION_FRAME_MS = 1000 / 24;

const REVIEW_FRAMES = [
  { id: "opening", time: 0 },
  { id: "transition", time: 0.5 },
  { id: "resolved", time: 1 },
] as const;

const LABELS = {
  de: {
    frames: {
      opening: "Auftakt",
      resolved: "Aufgelöst",
      transition: "Übergang",
    },
    replay: "Bewegung wiederholen",
    study: "Bewegungsstudie · A Kante",
  },
  en: {
    frames: {
      opening: "Opening",
      resolved: "Resolved",
      transition: "Transition",
    },
    replay: "Replay motion",
    study: "Motion study · A edge",
  },
} as const satisfies Record<VisualLocale, unknown>;

export function ConvergeMotionStudy({ brief, locale }: { brief: BrandIllustrationBrief; locale: VisualLocale }) {
  const [time, setTime] = useState(1);
  const [playing, setPlaying] = useState(false);
  const animationFrame = useRef<number | null>(null);
  const container = useRef<HTMLDivElement | null>(null);
  const hasAutoplayed = useRef(false);
  const reducedMotion = useRef(false);
  const labels = LABELS[locale];

  const cancel = useCallback(() => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    animationFrame.current = null;
  }, []);

  const showFrame = useCallback(
    (nextTime: number) => {
      cancel();
      setPlaying(false);
      setTime(nextTime);
    },
    [cancel],
  );

  const replay = useCallback(() => {
    cancel();
    if (reducedMotion.current) {
      setPlaying(false);
      setTime(1);
      return;
    }

    const startedAt = performance.now();
    let lastRenderedAt = startedAt - MOTION_FRAME_MS;
    setPlaying(true);
    setTime(0);

    const tick = (now: number) => {
      const nextTime = Math.min(1, (now - startedAt) / MOTION_DURATION_MS);
      if (now - lastRenderedAt >= MOTION_FRAME_MS || nextTime === 1) {
        lastRenderedAt = now;
        setTime(nextTime);
      }

      if (nextTime < 1) {
        animationFrame.current = requestAnimationFrame(tick);
        return;
      }

      animationFrame.current = null;
      setPlaying(false);
    };

    animationFrame.current = requestAnimationFrame(tick);
  }, [cancel]);

  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion.current = query.matches;
    let autoplay: number | null = null;

    const startOnce = () => {
      if (query.matches || hasAutoplayed.current) return;
      hasAutoplayed.current = true;
      autoplay = window.setTimeout(replay, 200);
    };

    const target = container.current;
    const observer =
      target && typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            ([entry]) => {
              if (entry?.isIntersecting) startOnce();
            },
            { root: target.closest("main"), threshold: 0.35 },
          )
        : null;

    if (target && observer) observer.observe(target);
    else startOnce();

    const handlePreference = (event: MediaQueryListEvent) => {
      reducedMotion.current = event.matches;
      if (event.matches) showFrame(1);
    };

    query.addEventListener("change", handlePreference);
    return () => {
      if (autoplay !== null) window.clearTimeout(autoplay);
      observer?.disconnect();
      query.removeEventListener("change", handlePreference);
      cancel();
    };
  }, [cancel, replay, showFrame]);

  return (
    <div ref={container} className="mt-8" data-converge-motion-study="true">
      <div className="mb-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-meta">{labels.study}</p>

        <div className="flex flex-wrap items-center gap-2">
          {REVIEW_FRAMES.map((frame) => (
            <button
              key={frame.id}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                Math.abs(time - frame.time) < 0.015 && !playing
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground",
              )}
              type="button"
              onClick={() => showFrame(frame.time)}
            >
              {labels.frames[frame.id]}
            </button>
          ))}

          <button
            className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-foreground px-3 py-1.5 text-xs text-background transition-opacity hover:opacity-85"
            type="button"
            onClick={replay}
          >
            {playing ? (
              <RotateCcw aria-hidden="true" className="size-3.5" />
            ) : (
              <Play aria-hidden="true" className="size-3.5" />
            )}

            {labels.replay}
          </button>
        </div>
      </div>

      <StoryVisual brief={brief} placement="wide" t={time} theme="dark" variant="edge" />
    </div>
  );
}
