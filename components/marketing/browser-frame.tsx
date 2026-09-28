"use client";

import { useEffect, useRef, useState } from "react";

import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { preconnect, prefetchDNS } from "react-dom";

type Props = {
  fallbackMessage?: string;
  loadAhead?: boolean;
  src: string;
  title: string;
  size?: "article" | "full";
};

const LOAD_AHEAD_MARGIN = "400px 0px";

const FRAME_HEIGHT_CLASS = {
  article: "h-[420px] sm:h-[520px] lg:h-[600px]",
  full: "h-[600px] md:h-[700px] lg:h-[750px]",
} as const;

function getOrigin(src: string): string | null {
  try {
    return new URL(src).origin;
  } catch {
    return null;
  }
}

export function BrowserFrame({ fallbackMessage, loadAhead = false, size = "full", src, title }: Props) {
  const t = useTranslations();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [currentUrl, setCurrentUrl] = useState(src);
  const [loaded, setLoaded] = useState(false);
  const [shouldMount, setShouldMount] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const origin = getOrigin(src);

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
    if (!fallbackMessage || !shouldMount || loaded) return;

    const timeout = window.setTimeout(() => setTimedOut(true), 12_000);

    return () => window.clearTimeout(timeout);
  }, [fallbackMessage, loaded, shouldMount]);

  useEffect(() => {
    setCurrentUrl(src);
    if (!loaded) return;
    const updateLocation = () => {
      try {
        const href = iframeRef.current?.contentWindow?.location.href;
        if (href && href !== "about:blank") setCurrentUrl(href);
      } catch {
        return;
      }
    };
    updateLocation();
    const interval = window.setInterval(updateLocation, 1000);
    return () => window.clearInterval(interval);
  }, [loaded, src]);

  return (
    <div data-live-preview className="not-prose relative mx-auto w-full max-w-live-preview">
      <div ref={frameRef} className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid min-h-10 grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2 sm:grid-cols-[1fr_minmax(0,2fr)_1fr]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-2 font-mono text-[10px] font-medium tracking-[0.14em] uppercase">
              <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-success motion-reduce:animate-none" />

              {t("BrowserFrame.live")}
            </span>
          </div>

          <a
            className="col-span-2 row-start-2 min-w-0 truncate text-center font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring sm:col-span-1 sm:col-start-2 sm:row-start-1"
            href={currentUrl}
            rel="noreferrer noopener"
            target="_blank"
            title={currentUrl}
          >
            {currentUrl.replace(/^https?:\/\//u, "")}
          </a>

          <a
            className="inline-flex justify-self-end shrink-0 items-center gap-1.5 rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            href={currentUrl}
            rel="noreferrer noopener"
            target="_blank"
          >
            {t("BrowserFrame.open")}

            <ArrowUpRight aria-hidden className="size-3.5" />
          </a>
        </div>

        <div className={`relative ${FRAME_HEIGHT_CLASS[size]}`}>
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
              ref={iframeRef}
              className={`block size-full border-0 bg-background transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
              loading={loadAhead ? "eager" : "lazy"}
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              src={src}
              title={title}
              onLoad={() => {
                setLoaded(true);
                setTimedOut(false);
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
