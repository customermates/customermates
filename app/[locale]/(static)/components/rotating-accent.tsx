"use client";

import { useEffect, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/core/utils/cn";

import { useHomepageMotion } from "./homepage-motion";

type Props = {
  className?: string;
  words: string[];
};

const ROTATION_INTERVAL_MS = 2_600;
const ROTATION_DURATION_SECONDS = 0.2;

export function RotatingAccent({ className, words }: Props) {
  const { ref, shouldAnimate, shouldReduceMotion } = useHomepageMotion<HTMLSpanElement>(0.6);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!shouldAnimate || words.length <= 1) return;

    const interval = window.setInterval(() => {
      setActiveIndex((currentIndex) => (currentIndex + 1) % words.length);
    }, ROTATION_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [shouldAnimate, words.length]);

  if (words.length === 0) return null;

  const visibleIndex = shouldReduceMotion ? 0 : activeIndex % words.length;
  const activeWord = words[visibleIndex];

  return (
    <span
      ref={ref}
      aria-hidden
      className={cn("relative inline-grid overflow-hidden align-bottom", className)}
      data-homepage-motion="rotating-accent"
      data-motion-active={shouldAnimate ? "true" : "false"}
    >
      {words.map((word) => (
        <span key={word} className="invisible col-start-1 row-start-1 whitespace-nowrap">
          {word}
        </span>
      ))}

      <AnimatePresence initial={false}>
        <motion.span
          key={activeWord}
          animate={{ opacity: 1, y: "0%" }}
          className="absolute inset-0 flex items-center justify-center whitespace-nowrap"
          exit={{ opacity: 0, y: "-100%" }}
          initial={shouldAnimate ? { opacity: 0, y: "100%" } : false}
          transition={{
            duration: ROTATION_DURATION_SECONDS,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          {activeWord}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
