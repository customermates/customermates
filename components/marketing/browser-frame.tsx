"use client";

import { useEffect, useRef, useState } from "react";

import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";

type Props = {
  src: string;
  title: string;
};

const MAX_TILT_DEG = 4;
const FALLOFF_PX = 500;

function getHostname(src: string): string {
  try {
    return new URL(src).hostname;
  } catch {
    return src;
  }
}

export function BrowserFrame({ src, title }: Props) {
  const t = useTranslations("BrowserFrame");
  const [loaded, setLoaded] = useState(false);
  const tiltRef = useRef<HTMLDivElement | null>(null);
  const hostname = getHostname(src);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      const el = tiltRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = event.clientX - cx;
      const dy = event.clientY - cy;
      const nx = Math.max(-1, Math.min(1, dx / (rect.width / 2 + FALLOFF_PX)));
      const ny = Math.max(-1, Math.min(1, dy / (rect.height / 2 + FALLOFF_PX)));
      el.style.setProperty("--tilt-x", `${(-ny * MAX_TILT_DEG).toFixed(2)}deg`);
      el.style.setProperty("--tilt-y", `${(nx * MAX_TILT_DEG).toFixed(2)}deg`);
      const gx = ((event.clientX - rect.left) / rect.width) * 100;
      const gy = ((event.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty("--glare-x", `${gx.toFixed(1)}%`);
      el.style.setProperty("--glare-y", `${gy.toFixed(1)}%`);
      const proximity = Math.max(Math.abs(nx), Math.abs(ny));
      el.style.setProperty("--glare-opacity", (1 - proximity * 0.6).toFixed(2));
    }

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div className="relative mx-auto w-full" style={{ perspective: "1400px" }}>
      <div aria-hidden className="pointer-events-none absolute -inset-12 -z-10">
        <div className="absolute -left-8 top-0 size-[300px] rounded-full bg-[rgba(94,74,227,0.3)] blur-[70px]" />

        <div className="absolute -right-8 bottom-0 size-[280px] rounded-full bg-[rgba(18,148,144,0.25)] blur-[60px]" />
      </div>

      <div
        ref={tiltRef}
        className="relative overflow-hidden rounded-[14px] border border-border bg-card shadow-[0_22px_48px_-14px_rgba(0,0,0,0.22)] transition-transform duration-200 ease-out will-change-transform"
        style={{ transform: "rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg))" }}
      >
        <div className="flex h-[34px] items-center gap-1.5 border-b border-border bg-muted/50 px-3">
          <span className="size-2.5 rounded-full bg-[#ff5f56]" />

          <span className="size-2.5 rounded-full bg-[#ffbd2e]" />

          <span className="size-2.5 rounded-full bg-[#27c93f]" />

          <span className="flex-1 text-center font-mono text-[11px] text-muted-foreground">
            {/* eslint-disable-next-line react/jsx-newline */}
            {hostname} · {t("live")}
          </span>

          <a
            className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            href={src}
            rel="noreferrer noopener"
            target="_blank"
          >
            {t("open")}

            <ArrowUpRight className="size-3" />
          </a>
        </div>

        <div className="relative h-[600px] md:h-[700px] lg:h-[750px]">
          {!loaded && <div className="absolute inset-0 animate-pulse bg-muted" />}

          <iframe
            className={`block size-full border-0 bg-background transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            src={src}
            title={title}
            onLoad={() => setLoaded(true)}
          />
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 mix-blend-overlay transition-opacity duration-300"
          style={{
            background:
              "radial-gradient(circle 240px at var(--glare-x, 50%) var(--glare-y, 50%), rgba(255,255,255,0.18), rgba(255,255,255,0.04) 40%, transparent 70%)",
            opacity: "var(--glare-opacity, 0)",
          }}
        />
      </div>
    </div>
  );
}
