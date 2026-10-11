"use client";

import { useEffect, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/core/utils/cn";

import { useHomepageMotion } from "./homepage-motion";

type Props = {
  activeClassName?: string;
  className?: string;
  prefix?: string;
  words: string[];
};

const ROTATION_INTERVAL_MS = 2_600;
const ROTATION_DURATION_SECONDS = 0.35;
const EASE = [0.22, 1, 0.36, 1] as const;

export function RotatingAccent({ activeClassName, className, prefix, words }: Props) {
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
  const transition = { duration: ROTATION_DURATION_SECONDS, ease: EASE };

  return (
    <span
      ref={ref}
      aria-hidden
      className={cn(
        "flex max-w-full flex-col items-center sm:flex-row sm:items-baseline sm:justify-center sm:gap-x-[0.25em]",
        className,
      )}
      data-homepage-motion="rotating-accent"
      data-motion-active={shouldAnimate ? "true" : "false"}
    >
      {prefix ? (
        <motion.span className="inline-block" layout={shouldAnimate ? "position" : false} transition={transition}>
          {prefix}
        </motion.span>
      ) : null}

      <motion.span
        className="relative inline-flex overflow-hidden whitespace-nowrap"
        layout={shouldAnimate}
        transition={transition}
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={activeWord}
            animate={{ opacity: 1, y: "0%" }}
            className={cn("inline-block", activeClassName)}
            exit={{ opacity: 0, y: "-100%" }}
            initial={shouldAnimate ? { opacity: 0, y: "100%" } : false}
            transition={transition}
          >
            {activeWord}
          </motion.span>
        </AnimatePresence>
      </motion.span>
    </span>
  );
}
