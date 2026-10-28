"use client";

import Image from "next/image";
import { useEffect } from "react";

import { useHomepageMotion } from "./homepage-motion";

type Mark = {
  key: string;
  alt: string;
  src: string;
  className?: string;
};

const MARKS: Mark[] = [
  {
    key: "claude",
    alt: "Claude",
    src: "/icons/hero/claude.svg",
  },
  {
    key: "gmail",
    alt: "Gmail",
    src: "/icons/hero/gmail.svg",
  },
  {
    key: "linkedin",
    alt: "LinkedIn",
    src: "/icons/hero/linkedin.svg",
  },
  {
    key: "openai",
    alt: "OpenAI",
    src: "/icons/hero/openai.svg",
    className: "dark:invert",
  },
  {
    key: "telegram",
    alt: "Telegram",
    src: "/icons/hero/telegram.svg",
  },
  {
    key: "n8n",
    alt: "n8n",
    src: "/icons/integrations/n8n.svg",
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
            <Image alt={mark.alt} className={mark.className} draggable={false} height={64} src={mark.src} width={64} />
          </span>
        </span>
      ))}
    </div>
  );
}
