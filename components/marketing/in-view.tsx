"use client";

import type { ReactNode } from "react";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/core/utils/cn";

export type InViewState = "idle" | "playing" | "waiting";

type Props = {
  amount?: number;
  children: ReactNode;
  className?: string;
  id?: string;
};

export function useInViewState<T extends Element>(amount = 0.35) {
  const ref = useRef<T>(null);
  const [state, setState] = useState<InViewState>("idle");

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const rect = element.getBoundingClientRect();
    const visible = rect.top < window.innerHeight * (1 - amount) && rect.bottom > 0;
    setState(visible ? "playing" : "waiting");
    if (visible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setState("playing");
        observer.disconnect();
      },
      { threshold: amount },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [amount]);

  return { ref, state };
}

export function InView({ amount, children, className, id }: Props) {
  const { ref, state } = useInViewState<HTMLDivElement>(amount);

  return (
    <div ref={ref} className={cn(className)} data-in-view={state} id={id}>
      {children}
    </div>
  );
}
