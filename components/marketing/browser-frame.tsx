"use client";

import { useEffect, useRef, useState } from "react";

import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";

type Props = {
  src: string;
  title: string;
};

function getHostname(src: string): string {
  try {
    return new URL(src).hostname;
  } catch {
    return src;
  }
}

export function BrowserFrame({ src, title }: Props) {
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
      <div ref={frameRef} className="relative overflow-hidden rounded-card border border-border bg-card">
        <div className="flex h-9 items-center gap-1.5 border-b border-border px-3">
          <span className="size-2.5 rounded-full border border-input" />

          <span className="size-2.5 rounded-full border border-input" />

          <span className="size-2.5 rounded-full border border-input" />

          <span className="flex flex-1 items-center justify-center gap-1.5 font-mono text-xs text-muted-foreground">
            <span>
              {/* eslint-disable-next-line react/jsx-newline */}
              {hostname} · {t("BrowserFrame.live")}
            </span>

            <span aria-hidden className="relative inline-flex size-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-75 motion-reduce:animate-none" />

              <span className="relative size-1.5 rounded-full bg-success" />
            </span>
          </span>

          <a
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            href={src}
            rel="noreferrer noopener"
            target="_blank"
          >
            {t("BrowserFrame.open")}

            <ArrowUpRight className="size-3" />
          </a>
        </div>

        <div className="relative h-[600px] md:h-[700px] lg:h-[750px]">
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
