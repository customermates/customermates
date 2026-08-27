"use client";

import type { ReactNode } from "react";

import { createContext, useContext } from "react";

export const MARKETING_SECTION_TONES = ["page", "canvas", "inverse"] as const;

export type MarketingSectionTone = (typeof MARKETING_SECTION_TONES)[number];
export type MarketingImageTheme = "light" | "dark";

const MarketingToneContext = createContext<MarketingSectionTone>("page");

export function resolveMarketingImageTheme(theme: MarketingImageTheme, tone: MarketingSectionTone) {
  if (tone !== "inverse") return theme;

  return theme === "dark" ? "light" : "dark";
}

export function useMarketingSectionTone() {
  return useContext(MarketingToneContext);
}

export function MarketingToneProvider({ children, tone }: { children: ReactNode; tone: MarketingSectionTone }) {
  return <MarketingToneContext.Provider value={tone}>{children}</MarketingToneContext.Provider>;
}
