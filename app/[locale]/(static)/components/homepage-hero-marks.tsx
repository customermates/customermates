"use client";

import type { CSSProperties } from "react";

import Image from "next/image";
import { useEffect } from "react";

import { useHomepageMotion } from "./homepage-motion";

type Mark = {
  key: string;
  src: string;
  className?: string;
  style: CSSProperties;
};

const MARKS: Mark[] = [
  {
    key: "claude",
    src: "/icons/hero/claude.svg",
    style: {
      "--x": "max(-36rem, -42vw)",
      "--y": "10rem",
      "--s": "6rem",
      "--rot": "-8deg",
      "--depth": "1.2",
      "--d": "380ms",
      "--dur": "10.5s",
      "--dx": "4px",
      "--dy": "-12px",
      "--wob": "-2deg",
      "--fx": "-160px",
      "--fy": "-40px",
      "--tint": "rgb(217 119 87 / 0.22)",
    } as CSSProperties,
  },
  {
    key: "gmail",
    src: "/icons/hero/gmail.svg",
    style: {
      "--x": "max(-22rem, -26vw)",
      "--y": "5.5rem",
      "--s": "4rem",
      "--rot": "6deg",
      "--depth": "0.6",
      "--d": "620ms",
      "--dur": "8.5s",
      "--dx": "2px",
      "--dy": "-8px",
      "--wob": "3deg",
      "--fx": "-40px",
      "--fy": "-80px",
    } as CSSProperties,
  },
  {
    key: "linkedin",
    src: "/icons/hero/linkedin.svg",
    style: {
      "--x": "min(22rem, 26vw)",
      "--y": "5.5rem",
      "--s": "4rem",
      "--rot": "-5deg",
      "--depth": "0.6",
      "--d": "580ms",
      "--dur": "9.8s",
      "--dx": "-2px",
      "--dy": "-9px",
      "--wob": "-3deg",
      "--fx": "40px",
      "--fy": "-80px",
      "--tint": "rgb(10 102 194 / 0.16)",
    } as CSSProperties,
  },
  {
    key: "openai",
    src: "/icons/hero/openai.svg",
    className: "dark:invert",
    style: {
      "--x": "min(36rem, 42vw)",
      "--y": "10rem",
      "--s": "6rem",
      "--rot": "7deg",
      "--depth": "1.2",
      "--d": "460ms",
      "--dur": "9.2s",
      "--dx": "-4px",
      "--dy": "-10px",
      "--wob": "2deg",
      "--fx": "160px",
      "--fy": "-40px",
    } as CSSProperties,
  },
  {
    key: "telegram",
    src: "/icons/hero/telegram.svg",
    style: {
      "--x": "max(-30rem, -36vw)",
      "--y": "33rem",
      "--s": "5rem",
      "--rot": "4deg",
      "--depth": "0.9",
      "--d": "540ms",
      "--dur": "11.5s",
      "--dx": "3px",
      "--dy": "-9px",
      "--wob": "-3deg",
      "--fx": "-120px",
      "--fy": "80px",
      "--tint": "rgb(42 171 238 / 0.16)",
    } as CSSProperties,
  },
  {
    key: "n8n",
    src: "/icons/integrations/n8n.svg",
    style: {
      "--x": "min(30rem, 36vw)",
      "--y": "33rem",
      "--s": "5rem",
      "--rot": "-5deg",
      "--depth": "0.9",
      "--d": "700ms",
      "--dur": "7.8s",
      "--dx": "-3px",
      "--dy": "-11px",
      "--wob": "3deg",
      "--fx": "120px",
      "--fy": "80px",
      "--tint": "rgb(234 75 113 / 0.16)",
    } as CSSProperties,
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
      className="hero-marks pointer-events-none absolute inset-x-0 top-0 z-0 hidden h-[42rem] lg:block"
      data-motion={shouldAnimate ? "running" : "paused"}
    >
      {MARKS.map((mark) => (
        <span key={mark.key} className="hero-mark" data-hero-mark={mark.key} style={mark.style}>
          <span className="hero-mark-card">
            <Image alt="" className={mark.className} draggable={false} height={64} src={mark.src} width={64} />
          </span>
        </span>
      ))}
    </div>
  );
}
