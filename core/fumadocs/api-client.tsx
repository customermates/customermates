"use client";

import type { ReactNode } from "react";

import { ShikiConfigProvider } from "fumadocs-core/highlight/core/client";

import { highlighting } from "./highlighting";

export function APIHighlightingProvider({ children }: { children: ReactNode }) {
  return <ShikiConfigProvider config={highlighting}>{children}</ShikiConfigProvider>;
}
