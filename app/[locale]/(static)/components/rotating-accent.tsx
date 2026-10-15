"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/core/utils/cn";

import { useHomepageMotion } from "./homepage-motion";

type Props = {
  className?: string;
  highlightClassName?: string;
  words: string[];
};

const ROTATION_INTERVAL_MS = 2_600;
const ROTATION_DURATION_SECONDS = 0.35;
const EASE = [0.22, 1, 0.36, 1] as const;

export function RotatingAccent({ className, highlightClassName, words }: Props) {
  const { ref, shouldAnimate, shouldReduceMotion } = useHomepageMotion<HTMLSpanElement>(0.6);
  const [activeIndex, setActiveIndex] = useState(0);
  const [width, setWidth] = useState<number | null>(null);
  const boxRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!shouldAnimate || words.length <= 1) return;

    const interval = window.setInterval(() => {
      setActiveIndex((currentIndex) => (currentIndex + 1) % words.length);
    }, ROTATION_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [shouldAnimate, words.length]);

  const visibleIndex = shouldReduceMotion ? 0 : activeIndex % Math.max(words.length, 1);
  const activeWord = words[visibleIndex];

  useLayoutEffect(() => {
    const box = boxRef.current;
    const measure = measureRef.current;
    if (!box || !measure) return;

    const style = getComputedStyle(box);
    setWidth(measure.offsetWidth + Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight));
  }, [activeWord]);

  if (words.length === 0) return null;

  const transition = { duration: shouldAnimate ? ROTATION_DURATION_SECONDS : 0, ease: EASE };

  return (
    <span
      ref={ref}
      aria-hidden
      className={cn("flex max-w-full justify-center", className)}
      data-homepage-motion="rotating-accent"
      data-motion-active={shouldAnimate ? "true" : "false"}
    >
      <motion.span
        ref={boxRef}
        animate={width === null ? undefined : { width }}
        className={cn(
          "relative inline-flex justify-center overflow-x-visible overflow-y-clip whitespace-nowrap",
          highlightClassName,
        )}
        initial={false}
        transition={transition}
      >
        <span
          ref={measureRef}
          className="pointer-events-none invisible absolute whitespace-nowrap after:content-[attr(data-word)]"
          data-word={activeWord}
        />

        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={activeWord}
            animate={{ opacity: 1, y: "0%" }}
            className="inline-block after:content-[attr(data-word)]"
            data-word={activeWord}
            exit={{ opacity: 0, y: "-100%" }}
            initial={shouldAnimate ? { opacity: 0, y: "100%" } : false}
            transition={transition}
          />
        </AnimatePresence>
      </motion.span>
    </span>
  );
}
