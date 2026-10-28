"use client";

import { useEffect } from "react";

import { cn } from "@/core/utils/cn";

import { useHomepageMotion } from "./homepage-motion";

type Mark = {
  key: string;
  className?: string;
};

const MARKS: Mark[] = [
  {
    key: "claude",
  },
  {
    key: "gmail",
  },
  {
    key: "linkedin",
  },
  {
    key: "openai",
    className: "dark:invert",
  },
  {
    key: "telegram",
  },
  {
    key: "n8n",
  },
];

export function HomepageHeroMarks() {
  const { ref, shouldAnimate } = useHomepageMotion<HTMLDivElement>(0.1);

  useEffect(() => {
    const field = ref.current;
    const hero = field?.parentElement;
    if (!field || !hero || !shouldAnimate || !window.matchMedia("(pointer: fine)").matches) return;

    const events = new AbortController();
    let frame: number | undefined;
    let pointer: { x: number; y: number } | null = null;

    const reset = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
      pointer = null;
      field.style.setProperty("--px", "0px");
      field.style.setProperty("--py", "0px");
    };

    hero.addEventListener(
      "pointermove",
      (event) => {
        pointer = { x: event.clientX, y: event.clientY };
        frame ??= requestAnimationFrame(() => {
          frame = undefined;
          if (!pointer) return;
          const bounds = hero.getBoundingClientRect();
          if (bounds.width === 0 || bounds.height === 0) return;
          field.style.setProperty("--px", `${(((pointer.x - bounds.left) / bounds.width - 0.5) * 36).toFixed(1)}px`);
          field.style.setProperty("--py", `${(((pointer.y - bounds.top) / bounds.height - 0.5) * 28).toFixed(1)}px`);
        });
      },
      { signal: events.signal },
    );
    hero.addEventListener("pointerleave", reset, { signal: events.signal });

    return () => {
      events.abort();
      reset();
    };
  }, [ref, shouldAnimate]);

  return (
    <div
      ref={ref}
      aria-hidden
      data-homepage-hero-marks
      className="hero-marks pointer-events-none absolute inset-x-0 top-0 z-0 h-[42rem]"
      data-motion={shouldAnimate ? "running" : "paused"}
    >
      {MARKS.map((mark) => (
        <span key={mark.key} className="hero-mark" data-hero-mark={mark.key}>
          <span className="hero-mark-card mark-glow">
            <span className={cn("hero-mark-image", mark.className)} />
          </span>
        </span>
      ))}
    </div>
  );
}
