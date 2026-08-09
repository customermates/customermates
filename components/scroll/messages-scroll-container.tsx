"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";

import { ScrollReturnButton } from "./scroll-return-button";
import { scrollToAnchor } from "./use-scroll-return";

type Props = {
  className?: string;
  jumpToLatestLabel?: string;
  loadOlderLabel?: string;
  scrollRegionLabel?: string;
  scrollKey: string;
  onTopReach?: () => Promise<void>;
  children: React.ReactNode;
};

export function MessagesScrollContainer({
  className,
  jumpToLatestLabel,
  loadOlderLabel,
  scrollRegionLabel,
  scrollKey,
  onTopReach,
  children,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const loadOlderButtonRef = useRef<HTMLButtonElement>(null);
  const stickToBottom = useRef(true);
  const topReachInFlight = useRef(false);
  const scrollVersion = useRef(0);
  const [isAwayFromLatest, setIsAwayFromLatest] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    stickToBottom.current = true;
    topReachInFlight.current = false;
    scrollVersion.current += 1;
    setIsAwayFromLatest(false);
    setIsLoadingOlder(false);
    el.scrollTop = el.scrollHeight;
  }, [scrollKey]);

  useEffect(() => {
    const el = ref.current;
    const content = contentRef.current;
    if (!el || !content) return;

    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) el.scrollTop = el.scrollHeight;
    });

    observer.observe(content);

    return () => observer.disconnect();
  }, []);

  const loadOlder = () => {
    const el = ref.current;
    if (!el || !onTopReach || topReachInFlight.current) return;
    const restoreRegionFocus = document.activeElement === loadOlderButtonRef.current;
    topReachInFlight.current = true;
    stickToBottom.current = false;
    setIsLoadingOlder(true);
    const version = scrollVersion.current;
    const prevHeight = el.scrollHeight;
    const prevTop = el.scrollTop;
    void onTopReach().finally(() => {
      requestAnimationFrame(() => {
        if (version !== scrollVersion.current || ref.current !== el) {
          setIsLoadingOlder(false);
          return;
        }
        const grown = el.scrollHeight - prevHeight;
        if (grown > 0) el.scrollTop = prevTop + grown;
        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        stickToBottom.current = isNearBottom;
        setIsAwayFromLatest(!isNearBottom);
        topReachInFlight.current = false;
        setIsLoadingOlder(false);
        if (restoreRegionFocus && !loadOlderButtonRef.current) el.focus({ preventScroll: true });
      });
    });
  };

  const handleScroll = () => {
    const el = ref.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stickToBottom.current = isNearBottom;
    setIsAwayFromLatest(!isNearBottom);

    if (el.scrollTop < 100) loadOlder();
  };

  const jumpToLatest = () => {
    const el = ref.current;
    if (!el) return;

    stickToBottom.current = true;
    setIsAwayFromLatest(false);
    scrollToAnchor(el, "bottom");
    requestAnimationFrame(() => el.focus({ preventScroll: true }));
  };

  return (
    <div className="relative flex min-h-0 flex-1">
      <div
        ref={ref}
        aria-label={scrollRegionLabel}
        className={cn("flex-1 overflow-y-auto py-3", className)}
        role="region"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        onScroll={handleScroll}
      >
        <div ref={contentRef}>
          {loadOlderLabel && onTopReach && (
            <div className="flex justify-center py-1">
              <Button
                ref={loadOlderButtonRef}
                aria-busy={isLoadingOlder}
                disabled={isLoadingOlder}
                size="sm"
                type="button"
                variant="ghost"
                onClick={loadOlder}
              >
                {loadOlderLabel}
              </Button>
            </div>
          )}

          {children}
        </div>
      </div>

      {jumpToLatestLabel && (
        <ScrollReturnButton
          direction="bottom"
          isAway={isAwayFromLatest}
          label={jumpToLatestLabel}
          onReturn={jumpToLatest}
        />
      )}
    </div>
  );
}
