"use client";

import { useEffect, useRef, useState } from "react";

import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";

type Props = {
  src: string;
  title: string;
  size?: "article" | "full";
};

const FRAME_HEIGHT_CLASS = {
  article: "h-[420px] sm:h-[520px] lg:h-[600px]",
  full: "h-[600px] md:h-[700px] lg:h-[750px]",
} as const;

function getHostname(src: string): string {
  try {
    return new URL(src).hostname;
  } catch {
    return src;
  }
}

export function BrowserFrame({ size = "full", src, title }: Props) {
  const t = useTranslations();
  const [loaded, setLoaded] = useState(false);
  const [shouldMount, setShouldMount] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const hostname = getHostname(src);

  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShouldMount(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setShouldMount(true);
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative mx-auto w-full">
      <div aria-hidden className="pointer-events-none absolute -inset-12 -z-10">
        <div className="absolute -left-8 top-0 size-[300px] rounded-full bg-foreground/5 blur-[70px]" />

        <div className="absolute -right-8 bottom-0 size-[280px] rounded-full bg-primary/10 blur-[60px]" />
      </div>

      <div
        ref={frameRef}
        className="relative overflow-hidden rounded-xl border border-border-strong bg-card shadow-xl shadow-black/10"
      >
        <div className="flex h-10 items-center gap-1.5 border-b border-border-strong bg-background px-4">
          <span className="size-2.5 rounded-full bg-destructive" />

          <span className="size-2.5 rounded-full bg-warning" />

          <span className="size-2.5 rounded-full bg-success" />

          <span className="flex flex-1 items-center justify-center gap-1.5 font-mono text-[11px] text-foreground/70">
            <span>
              {/* eslint-disable-next-line react/jsx-newline */}
              {hostname} · {t("BrowserFrame.live")}
            </span>

            <span aria-hidden className="relative inline-flex size-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-75" />

              <span className="relative size-1.5 rounded-full bg-success" />
            </span>
          </span>

          <a
            className="flex items-center gap-1 text-[11px] font-medium text-foreground/75 hover:text-foreground hover:underline"
            href={src}
            rel="noreferrer noopener"
            target="_blank"
          >
            {t("BrowserFrame.open")}

            <ArrowUpRight className="size-3" />
          </a>
        </div>

        <div className={`relative ${FRAME_HEIGHT_CLASS[size]}`}>
          {!loaded && <div className="absolute inset-0 animate-pulse bg-placeholder motion-reduce:animate-none" />}

          {shouldMount && (
            <iframe
              className={`block size-full border-0 bg-background transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
              loading="lazy"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              src={src}
              title={title}
              onLoad={() => setLoaded(true)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
