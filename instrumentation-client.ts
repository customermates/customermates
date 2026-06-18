import * as Sentry from "@sentry/nextjs";

import { isExpectedError } from "@/core/errors/app-errors";
import { env } from "@/env";

const sentryEnabled = Boolean(env.NEXT_PUBLIC_SENTRY_DSN);

if (sentryEnabled) {
  Sentry.init({
    dsn: env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend(event, hint) {
      if (isExpectedError(hint?.originalException)) return null;

      if (env.NODE_ENV !== "production") {
        console.error(hint?.originalException ?? event);
        return null;
      }
      return event;
    },
  });
}

export const onRouterTransitionStart = sentryEnabled ? Sentry.captureRouterTransitionStart : undefined;
