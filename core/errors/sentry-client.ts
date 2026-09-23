import type * as SentrySdk from "@sentry/nextjs";

import { isExpectedError } from "./app-errors";
import { errorDigest } from "./error-digest";
import { scrubAdIdentifiersFromEvent } from "./scrub-ad-identifiers";

let browserSdk: Promise<typeof SentrySdk> | null = null;

export function loadSentry(): Promise<typeof SentrySdk> {
  browserSdk ??= import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        integrations: (defaults) => defaults.filter((integration) => integration.name !== "BrowserTracing"),
        tracesSampleRate: 0,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
        beforeSend(event, hint) {
          if (isExpectedError(hint?.originalException)) return null;

          if (process.env.NODE_ENV !== "production") {
            console.error(hint?.originalException ?? event);
            return null;
          }

          const digest = errorDigest(hint?.originalException);
          if (digest) event.tags = { ...event.tags, digest };

          return scrubAdIdentifiersFromEvent(event);
        },
      });

      return Sentry;
    })
    .catch((error: unknown) => {
      browserSdk = null;
      throw error;
    });

  return browserSdk;
}

export function captureError(error: unknown): void {
  const sdk = typeof window === "undefined" ? import("@sentry/nextjs") : loadSentry();

  void sdk.then((Sentry) => Sentry.captureException(error)).catch(() => undefined);
}
