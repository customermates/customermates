"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    const theme = resolvedTheme === "system" ? systemTheme : resolvedTheme;
    setThemePath(theme === "light" ? "light" : "dark");
  }, [resolvedTheme, systemTheme]);

  const source = `/scenes/${themePath}/${name}.mp4`;

  return (
    <video
      key={source}
      autoPlay
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
