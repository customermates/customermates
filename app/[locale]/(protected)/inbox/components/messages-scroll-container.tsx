"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  scrollKey: string;
  onTopReach?: () => Promise<void>;
  children: React.ReactNode;
};

export function MessagesScrollContainer({ className, scrollKey, onTopReach, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const topReachInFlight = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    stickToBottom.current = true;
    el.scrollTop = el.scrollHeight;
  }, [scrollKey]);

  useEffect(() => {
    const el = ref.current;
    const content = el?.firstElementChild;
    if (!el || !content) return;

    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) el.scrollTop = el.scrollHeight;
    });

    observer.observe(content);

    return () => observer.disconnect();
  }, []);

  const handleScroll = () => {
    const el = ref.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;

    if (el.scrollTop < 100 && onTopReach && !topReachInFlight.current) {
      topReachInFlight.current = true;
      const prevHeight = el.scrollHeight;
      const prevTop = el.scrollTop;
      void onTopReach().finally(() => {
        requestAnimationFrame(() => {
          const grown = el.scrollHeight - prevHeight;
          if (grown > 0) el.scrollTop = prevTop + grown;
          topReachInFlight.current = false;
        });
      });
    }
  };

  return (
    <div ref={ref} className={cn("flex-1 overflow-y-auto py-3", className)} onScroll={handleScroll}>
      {children}
    </div>
  );
}
