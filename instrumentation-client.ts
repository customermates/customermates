import type * as SentrySdk from "@sentry/nextjs";

import { loadSentry } from "@/core/errors/sentry-client";

const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

// A static import here makes @sentry/nextjs the first script in every document, including a blog
// post: ~176 KB that parses, installs fetch/XHR/history/console wrappers and constructs
// PerformanceObservers inside the hydration window, before the largest text element can paint.
// Loading it when the main thread next goes idle keeps it off that path. Uncaught errors thrown
// before it lands are buffered and replayed, and explicit reports go through the same loader
// (core/errors/sentry-client.ts), so every report reaches an initialised SDK.
const buffered: unknown[] = [];
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
  return loadSentry().then((Sentry) => {
    if (!installed) {
      installed = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("error", bufferError);
        window.removeEventListener("unhandledrejection", bufferRejection);
      }
    }
    for (const error of buffered.splice(0)) Sentry.captureException(error);

    return Sentry;
  });
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
