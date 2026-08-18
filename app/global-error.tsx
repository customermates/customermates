"use client";

import "@/styles/globals.css";
import { latin } from "./fonts";

import { useEffect, useState } from "react";
import * as Sentry from "@sentry/nextjs";

import { ErrorPageView } from "@/components/shared/error-page-view";
import { defaultGlobalErrorFallback, globalErrorFallback } from "@/i18n/global-error-copy";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: Props) {
  const [fallback, setFallback] = useState(defaultGlobalErrorFallback);

  useEffect(() => setFallback(globalErrorFallback()), []);

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

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
