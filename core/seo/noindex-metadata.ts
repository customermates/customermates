import type { Metadata } from "next";

export const NOINDEX_METADATA = {
  robots: {
    follow: false,
    index: false,
    nocache: true,
  },
} as const satisfies Metadata;
