"use client";

import type { ComponentProps } from "react";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useTheme } from "next-themes";

import { useServerTheme } from "@/components/server-theme-provider";

type Props = ComponentProps<typeof Image> & {
  isLocalized?: boolean;
};

export function XImage({ isLocalized = false, src, ...props }: Props) {
  const resolvedLocale = useLocale();
  const serverTheme = useServerTheme();
  const { resolvedTheme, systemTheme } = useTheme();
  const [themePath, setThemePath] = useState<"light" | "dark">(serverTheme === "dark" ? "dark" : "light");

  useEffect(() => {
    const theme = resolvedTheme === "system" ? systemTheme : resolvedTheme;
    const newThemePath = theme === "light" ? "light" : "dark";
    setThemePath(newThemePath);
  }, [resolvedTheme, systemTheme]);

  const imageSrc = `/images/${themePath}/${isLocalized ? `${resolvedLocale}/` : ""}${src as string}`;

  return <Image key={imageSrc} decoding="async" loading="lazy" src={imageSrc} {...props} />;
}
