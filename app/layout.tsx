import "@/styles/globals.css";

import type { Metadata, Viewport } from "next";

import { getLocale, getMessages } from "next-intl/server";
import { cookies } from "next/headers";

import { latin, mono } from "./fonts";
import { Providers } from "./providers";

import { GLOBAL_METADATA } from "@/core/seo/homepage-metadata";
import { pickMarketingMessages } from "@/i18n/marketing-messages";

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

export default async function RootLayout({ children }: Props) {
  const [messages, displayLanguage, cookiesStore] = await Promise.all([getMessages(), getLocale(), cookies()]);

  return (
    <html
      suppressHydrationWarning
      className={`${latin.variable} ${mono.variable} ${latin.className}`}
      data-scroll-behavior="smooth"
      lang={displayLanguage}
    >
      <body className="h-svh flex flex-col font-sans antialiased">
        <Providers
          defaultTheme={cookiesStore.get("theme")?.value}
          displayLanguage={displayLanguage}
          messages={pickMarketingMessages(messages)}
        >
          {children}
        </Providers>
      </body>
    </html>
  );
}
