import "@/styles/site";

import type { Metadata, Viewport } from "next";

import { GLOBAL_METADATA } from "@/core/seo/homepage-metadata";

export const metadata: Metadata = GLOBAL_METADATA;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eeeef0" },
    { media: "(prefers-color-scheme: dark)", color: "#08080b" },
  ],
};

type Props = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: Props) {
  return children;
}
