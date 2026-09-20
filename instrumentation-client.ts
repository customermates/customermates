import type * as SentrySdk from "@sentry/nextjs";

import { errorDigest } from "@/core/errors/error-digest";
import { isExpectedError } from "@/core/errors/app-errors";
import { scrubAdIdentifiersFromEvent } from "@/core/errors/scrub-ad-identifiers";

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const sentryEnabled = Boolean(sentryDsn);

// A static import here makes @sentry/nextjs the first script in every document, including a blog
// post: ~176 KB that parses, installs fetch/XHR/history/console wrappers and constructs
// PerformanceObservers inside the hydration window, before the largest text element can paint.
// Loading it when the main thread next goes idle keeps it off that path. Errors thrown before it
// lands are buffered and replayed, so nothing is dropped - only delayed.
const buffered: unknown[] = [];
let sdk: Promise<typeof SentrySdk> | null = null;
let installed = false;

function bufferError(event: ErrorEvent) {
  if (!installed) buffered.push(event.error ?? event.message);
  void startSentry();
}

function bufferRejection(event: PromiseRejectionEvent) {
  if (!installed) buffered.push(event.reason);
  void startSentry();
}

function startSentry(): Promise<typeof SentrySdk> {
  sdk ??= import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn: sentryDsn,
      // Sentry only drops browserTracingIntegration when the bundler rewrites __SENTRY_TRACING__,
      // which its webpack plugin does and Turbopack does not. Filter it out explicitly.
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

    installed = true;
    if (typeof window !== "undefined") {
      window.removeEventListener("error", bufferError);
      window.removeEventListener("unhandledrejection", bufferRejection);
    }
    for (const error of buffered.splice(0)) Sentry.captureException(error);

    return Sentry;
  });

  return sdk;
}

if (sentryEnabled && typeof window !== "undefined") {
  window.addEventListener("error", bufferError);
  window.addEventListener("unhandledrejection", bufferRejection);

  const whenIdle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 2000));
  whenIdle(() => void startSentry());
}

function routerTransitionStart(...args: unknown[]): void {
  void startSentry()
    .then((Sentry) => {
      (Sentry.captureRouterTransitionStart as (...callArgs: unknown[]) => void)(...args);
    })
    .catch(() => undefined);
}

export const onRouterTransitionStart = sentryEnabled ? routerTransitionStart : undefined;
