"use client";

import type { ComponentProps } from "react";

import Image from "next/image";
import { useLocale } from "next-intl";
import { useTheme } from "next-themes";

import { useServerTheme } from "@/components/server-theme-provider";
import {
  resolveMarketingImageTheme,
  useMarketingSectionTone,
  type MarketingImageTheme,
} from "@/components/marketing/marketing-tone-context";

type Props = ComponentProps<typeof Image> & {
  isLocalized?: boolean;
};

export function AppImage({ isLocalized = false, src, ...props }: Props) {
  const resolvedLocale = useLocale();
  const serverTheme = useServerTheme();
  const marketingTone = useMarketingSectionTone();
  const { resolvedTheme, systemTheme } = useTheme();
  const serverThemePath: MarketingImageTheme = serverTheme === "dark" ? "dark" : "light";
  const resolvedClientTheme = resolvedTheme === "system" ? systemTheme : resolvedTheme;
  const globalThemePath: MarketingImageTheme =
    resolvedClientTheme === "dark" ? "dark" : resolvedClientTheme === "light" ? "light" : serverThemePath;
  const themePath = resolveMarketingImageTheme(globalThemePath, marketingTone);

  const imageSrc = `/images/${themePath}/${isLocalized ? `${resolvedLocale}/` : ""}${src as string}`;

  return <Image key={imageSrc} decoding="async" loading="lazy" src={imageSrc} {...props} />;
}
