"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

import { useServerTheme } from "@/components/server-theme-provider";

type Props = {
  className?: string;
  height?: number;
  label: string;
  name: string;
  width?: number;
};

export function AppVideo({ className, height = 920, label, name, width = 1280 }: Props) {
  const serverTheme = useServerTheme();
  const { resolvedTheme, systemTheme } = useTheme();
  const [themePath, setThemePath] = useState<"light" | "dark">(serverTheme === "dark" ? "dark" : "light");
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const theme = resolvedTheme === "system" ? systemTheme : resolvedTheme;
    setThemePath(theme === "light" ? "light" : "dark");
  }, [resolvedTheme, systemTheme]);

  useEffect(() => {
    if (typeof matchMedia !== "function") return;

    const query = matchMedia("(prefers-reduced-motion: reduce)");

    const apply = () => {
      const el = ref.current;
      if (!el) return;
      if (query.matches) {
        el.pause();
        el.currentTime = 0;
        return;
      }

      void el.play().catch(() => undefined);
    };

    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [themePath]);

  const source = `/scenes/${themePath}/${name}.mp4`;

  return (
    <video
      key={source}
      ref={ref}
      loop
      muted
      playsInline
      aria-label={label}
      className={className}
      height={height}
      poster={`/scenes/${themePath}/${name}.png`}
      preload="metadata"
      src={source}
      width={width}
    />
  );
}
