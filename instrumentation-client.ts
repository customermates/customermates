import * as Sentry from "@sentry/nextjs";

import { isExpectedError } from "@/core/errors/app-errors";
import { env } from "@/env";

const sentryEnabled = Boolean(env.SENTRY_DSN) && env.NODE_ENV === "production";

if (sentryEnabled) {
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

export const onRouterTransitionStart = sentryEnabled ? Sentry.captureRouterTransitionStart : undefined;
