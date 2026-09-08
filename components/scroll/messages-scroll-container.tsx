"use client";

import type { RefObject } from "react";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";
import { reportApplicationError } from "@/core/errors/report-application-error";

import { ScrollReturnButton } from "./scroll-return-button";
import { prefersReducedMotion, scrollToAnchor } from "./use-scroll-return";

const AUTO_FOLLOW_SETTLE_MS = 1000;

type Props = {
  className?: string;
  jumpToLatestLabel?: string;
  latestItemKey?: string;
  loadOlderLabel?: string;
  scrollContainerRef?: RefObject<HTMLElement | null>;
  scrollFooterRef?: RefObject<HTMLElement | null>;
  scrollable?: boolean;
  scrollRegionLabel?: string;
  scrollKey: string;
  onTopReach?: () => Promise<void>;
  children: React.ReactNode;
};

export function MessagesScrollContainer({
  className,
  jumpToLatestLabel,
  latestItemKey,
  loadOlderLabel,
  scrollContainerRef,
  scrollFooterRef,
  scrollable = true,
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
  const [scrollFooterHeight, setScrollFooterHeight] = useState(0);
  const getScrollElement = useCallback(() => scrollContainerRef?.current ?? ref.current, [scrollContainerRef]);
  const usesExternalScroll = scrollable && Boolean(scrollContainerRef);

  useEffect(() => {
    if (!scrollable) return;
    const el = getScrollElement();
    if (!el) return;

    stickToBottom.current = true;
    topReachInFlight.current = false;
    scrollVersion.current += 1;
    setIsAwayFromLatest(false);
    setIsLoadingOlder(false);
    el.scrollTop = el.scrollHeight;
  }, [getScrollElement, scrollKey, scrollable]);

  useLayoutEffect(() => {
    if (!scrollable) return;
    const el = getScrollElement();
    if (!el || latestItemKey === undefined || !stickToBottom.current) return;

    el.scrollTop = el.scrollHeight;
  }, [getScrollElement, latestItemKey, scrollable]);

  useEffect(() => {
    if (!scrollable) return;
    const el = getScrollElement();
    const content = contentRef.current;
    const footer = usesExternalScroll ? scrollFooterRef?.current : null;
    if (!el || !content) return;

    const syncFooterHeight = () => {
      const nextHeight = footer?.getBoundingClientRect().height ?? 0;
      setScrollFooterHeight((currentHeight) => (currentHeight === nextHeight ? currentHeight : nextHeight));
    };

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
      syncFooterHeight();
      if (stickToBottom.current) followBottom();
    });

    syncFooterHeight();
    observer.observe(content);
    if (el !== content) observer.observe(el);
    if (footer && footer !== content && footer !== el) observer.observe(footer);
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
  }, [getScrollElement, scrollable, scrollFooterRef, usesExternalScroll]);

  const loadOlder = useCallback(() => {
    const el = getScrollElement();
    if (!el || !onTopReach || topReachInFlight.current) return;
    const restoreRegionFocus = document.activeElement === loadOlderButtonRef.current;
    topReachInFlight.current = true;
    stickToBottom.current = false;
    setIsLoadingOlder(true);
    const version = scrollVersion.current;
    const prevHeight = el.scrollHeight;
    const prevTop = el.scrollTop;
    void onTopReach()
      .finally(() => {
        requestAnimationFrame(() => {
          if (version !== scrollVersion.current || getScrollElement() !== el) {
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
      })
      .catch(reportApplicationError);
  }, [getScrollElement, onTopReach]);

  const handleScroll = useCallback(() => {
    const el = getScrollElement();
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
  }, [getScrollElement, loadOlder]);

  useEffect(() => {
    if (!scrollable || !scrollContainerRef) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll, scrollContainerRef, scrollable]);

  const jumpToLatest = useCallback(() => {
    const el = getScrollElement();
    if (!el) return;

    stickToBottom.current = true;
    autoFollowing.current = false;
    setIsAwayFromLatest(false);
    scrollToAnchor(el, "bottom");
    requestAnimationFrame(() => el.focus({ preventScroll: true }));
  }, [getScrollElement]);

  return (
    <div className={cn("relative flex-1", !usesExternalScroll && "flex min-h-0")}>
      {usesExternalScroll && jumpToLatestLabel && (
        <div
          className="pointer-events-none sticky z-20 h-0"
          style={{ top: `calc(100% - 3rem - ${scrollFooterHeight}px)` }}
        >
          <ScrollReturnButton
            className="pointer-events-auto top-0 right-2 bottom-auto"
            direction="bottom"
            isAway={isAwayFromLatest}
            label={jumpToLatestLabel}
            onReturn={jumpToLatest}
          />
        </div>
      )}

      <div
        ref={ref}
        aria-label={scrollable && !usesExternalScroll ? scrollRegionLabel : undefined}
        className={cn(
          "py-3",
          !usesExternalScroll && "min-h-0 flex-1",
          scrollable && !usesExternalScroll && "overflow-y-auto overscroll-contain",
          className,
        )}
        role={scrollable && !usesExternalScroll ? "region" : undefined}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={scrollable && !usesExternalScroll ? 0 : undefined}
        onScroll={scrollable && !usesExternalScroll ? handleScroll : undefined}
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

      {scrollable && !usesExternalScroll && jumpToLatestLabel && (
        <ScrollReturnButton
          className="right-5"
          direction="bottom"
          isAway={isAwayFromLatest}
          label={jumpToLatestLabel}
          onReturn={jumpToLatest}
        />
      )}
    </div>
  );
}
