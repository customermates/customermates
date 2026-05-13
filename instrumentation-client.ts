import * as Sentry from "@sentry/nextjs";

import { isExpectedError } from "@/core/errors/app-errors";
import { env } from "@/env";

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend(event, hint) {
      if (isExpectedError(hint?.originalException)) return null;
      return event;
    },
  });
}

export const onRouterTransitionStart = env.SENTRY_DSN ? Sentry.captureRouterTransitionStart : undefined;
