"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";

import { ScrollReturnButton } from "./scroll-return-button";
import { prefersReducedMotion, scrollToAnchor } from "./use-scroll-return";

const AUTO_FOLLOW_SETTLE_MS = 1000;

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
  const autoFollowing = useRef(false);
  const autoFollowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

    const releaseFollow = () => {
      autoFollowing.current = false;
      if (autoFollowTimer.current) clearTimeout(autoFollowTimer.current);
      autoFollowTimer.current = null;
    };
    const followBottom = () => {
      if (prefersReducedMotion()) {
        el.scrollTop = el.scrollHeight;
        return;
      }

      autoFollowing.current = true;
      if (autoFollowTimer.current) clearTimeout(autoFollowTimer.current);
      autoFollowTimer.current = setTimeout(releaseFollow, AUTO_FOLLOW_SETTLE_MS);
      el.scrollTo({ behavior: "smooth", top: el.scrollHeight });
    };
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) followBottom();
    });

    observer.observe(content);
    el.addEventListener("wheel", releaseFollow, { passive: true });
    el.addEventListener("touchmove", releaseFollow, { passive: true });
    el.addEventListener("keydown", releaseFollow);

    return () => {
      observer.disconnect();
      if (autoFollowTimer.current) clearTimeout(autoFollowTimer.current);
      el.removeEventListener("wheel", releaseFollow);
      el.removeEventListener("touchmove", releaseFollow);
      el.removeEventListener("keydown", releaseFollow);
    };
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

    if (autoFollowing.current && !isNearBottom) {
      setIsAwayFromLatest(false);
      return;
    }

    autoFollowing.current = false;

    stickToBottom.current = isNearBottom;
    setIsAwayFromLatest(!isNearBottom);

    if (el.scrollTop < 100) loadOlder();
  };

  const jumpToLatest = () => {
    const el = ref.current;
    if (!el) return;

    stickToBottom.current = true;
    autoFollowing.current = false;
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
