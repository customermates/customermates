import * as Sentry from "@sentry/nextjs";

import { isExpectedError } from "@/core/errors/app-errors";
import { env } from "@/env";

export function register() {
  if (!env.SENTRY_DSN) return;

  const init = {
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 0,
    beforeSend(event: Sentry.ErrorEvent, hint: Sentry.EventHint) {
      if (isExpectedError(hint?.originalException)) return null;
      return event;
    },
  } satisfies Sentry.NodeOptions;

  if (env.NEXT_RUNTIME === "nodejs") Sentry.init(init);
  if (env.NEXT_RUNTIME === "edge") Sentry.init(init);
}

export const onRequestError = Sentry.captureRequestError;
