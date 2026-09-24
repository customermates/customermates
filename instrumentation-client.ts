import type * as SentrySdk from "@/core/errors/sentry-sdk";

import { loadSentry } from "@/core/errors/sentry-client";

const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

// A static import here makes @sentry/nextjs the first script in every document, including a blog
// post: ~176 KB that parses, installs fetch/XHR/history/console wrappers and constructs
// PerformanceObservers inside the hydration window, before the largest text element can paint.
// Loading it when the main thread next goes idle keeps it off that path. Uncaught errors thrown
// before it lands are buffered and replayed, and explicit reports go through the same loader
// (core/errors/sentry-client.ts), so every report reaches an initialised SDK.
const buffered: unknown[] = [];

function bufferError(event: ErrorEvent) {
  buffered.push(event.error ?? event.message);
  void startSentry().catch(() => undefined);
}

function bufferRejection(event: PromiseRejectionEvent) {
  buffered.push(event.reason);
  void startSentry().catch(() => undefined);
}

function startSentry(): Promise<typeof SentrySdk> {
  return loadSentry().then((Sentry) => {
    window.removeEventListener("error", bufferError);
    window.removeEventListener("unhandledrejection", bufferRejection);
    for (const error of buffered.splice(0)) Sentry.captureException(error);

    return Sentry;
  });
}

if (sentryEnabled && typeof window !== "undefined") {
  window.addEventListener("error", bufferError);
  window.addEventListener("unhandledrejection", bufferRejection);

  const whenIdle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 2000));
  whenIdle(() => void startSentry().catch(() => undefined));
}

function routerTransitionStart(...args: unknown[]): void {
  void startSentry()
    .then((Sentry) => {
      (Sentry.captureRouterTransitionStart as (...callArgs: unknown[]) => void)(...args);
    })
    .catch(() => undefined);
}

export const onRouterTransitionStart = sentryEnabled ? routerTransitionStart : undefined;
