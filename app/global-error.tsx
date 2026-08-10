"use client";

import "@/styles/globals.css";

import { useEffect, useState } from "react";
import { Inter } from "next/font/google";

import { ErrorPageView } from "@/components/shared/error-page-view";
import { defaultGlobalErrorFallback, globalErrorFallback } from "@/i18n/global-error-copy";

const latin = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-sans",
});

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ reset }: Props) {
  const [fallback, setFallback] = useState(defaultGlobalErrorFallback);

  useEffect(() => setFallback(globalErrorFallback()), []);

  const { copy, locale } = fallback;

  return (
    <html className={`${latin.variable} ${latin.className} dark`} lang={locale}>
      <body className="h-svh flex flex-col font-sans antialiased">
        <ErrorPageView
          backHref="/"
          backLabel={copy.backLabel}
          body={copy.body}
          retryLabel={copy.retryLabel}
          subtitle={copy.subtitle}
          title={copy.title}
          onRetry={() => reset()}
        />
      </body>
    </html>
  );
}
