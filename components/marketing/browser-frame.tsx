"use client";

import { useEffect, useRef, useState } from "react";

import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { preconnect, prefetchDNS } from "react-dom";

import { cn } from "@/core/utils/cn";

import { ProductWindow } from "./product-window";

type Props = {
  fallbackMessage?: string;
  loadAhead?: boolean;
  src: string;
  title: string;
};

const LOAD_AHEAD_MARGIN = "400px 0px";

const DESKTOP_VIEWPORT = { height: 900, width: 1440 } as const;

const PHONE_VIEWPORT = { height: 780, width: 390 } as const;

const PHONE_FRAME_MAX_WIDTH = 640;

export const BROWSER_FRAME_REVEAL_DELAY_MS = 500;

function getOrigin(src: string): string | null {
  try {
    return new URL(src).origin;
  } catch {
    return null;
  }
}

export function BrowserFrame({ fallbackMessage, loadAhead = false, src, title }: Props) {
  const t = useTranslations();
  const frameRef = useRef<HTMLDivElement | null>(null);
  const revealTimer = useRef(0);
  const [loaded, setLoaded] = useState(false);
  const [shouldMount, setShouldMount] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [frameWidth, setFrameWidth] = useState<number | null>(null);
  const origin = getOrigin(src);
  const phone = frameWidth !== null && frameWidth < PHONE_FRAME_MAX_WIDTH;
  const viewport = phone ? PHONE_VIEWPORT : DESKTOP_VIEWPORT;
  const scale = frameWidth === null ? 1 : frameWidth / viewport.width;

  if (loadAhead && origin) {
    prefetchDNS(origin);
    preconnect(origin);
  }

  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShouldMount(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShouldMount(true);
          observer.disconnect();
        }
      },
      loadAhead ? { rootMargin: LOAD_AHEAD_MARGIN } : undefined,
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadAhead]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => setFrameWidth(entry.contentRect.width));
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!fallbackMessage || !shouldMount || loaded) return;

    const timeout = window.setTimeout(() => setTimedOut(true), 12_000);

    return () => window.clearTimeout(timeout);
  }, [fallbackMessage, loaded, shouldMount]);

  useEffect(() => () => window.clearTimeout(revealTimer.current), []);

  function reveal() {
    window.clearTimeout(revealTimer.current);
    revealTimer.current = window.setTimeout(() => {
      setLoaded(true);
      setTimedOut(false);
    }, BROWSER_FRAME_REVEAL_DELAY_MS);
  }

  return (
    <div data-live-preview data-reveal className="not-prose relative mx-auto w-full max-w-live-preview">
      <ProductWindow className={cn(phone && "mx-auto max-w-sm")}>
        <div ref={frameRef} className={cn("relative w-full", phone ? "aspect-[1/2]" : "aspect-[16/10]")}>
          {!loaded ? (
            <div className="absolute inset-0 animate-pulse bg-placeholder motion-reduce:animate-none" />
          ) : null}

          {timedOut && fallbackMessage ? (
            <div
              className="absolute inset-x-4 bottom-4 z-10 flex flex-col gap-3 rounded-xl border border-border-strong bg-background/95 p-4 shadow-lg backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between"
              role="status"
            >
              <p className="max-w-xl text-xs leading-5 text-muted-foreground">{fallbackMessage}</p>

              <a
                className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-foreground hover:underline"
                href={src}
                rel="noreferrer noopener"
                target="_blank"
              >
                {t("BrowserFrame.open")}

                <ArrowUpRight aria-hidden className="size-3" />
              </a>
            </div>
          ) : null}

          {shouldMount ? (
            <iframe
              className={cn(
                "absolute top-0 left-0 origin-top-left border-0 bg-sidebar transition-opacity duration-500 ease-out motion-reduce:transition-none",
                loaded ? "opacity-100" : "opacity-0",
              )}
              loading={loadAhead ? "eager" : "lazy"}
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              src={src}
              style={{ height: viewport.height, transform: `scale(${scale})`, width: viewport.width }}
              title={title}
              onLoad={reveal}
            />
          ) : null}
        </div>
      </ProductWindow>
    </div>
  );
}
