import * as Sentry from "@sentry/nextjs";

import { errorDigest } from "@/core/errors/error-digest";
import { isExpectedError } from "@/core/errors/app-errors";

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const sentryEnabled = Boolean(sentryDsn);

if (sentryEnabled) {
  Sentry.init({
    dsn: sentryDsn,
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

      return event;
    },
  });
}

export const onRouterTransitionStart = sentryEnabled ? Sentry.captureRouterTransitionStart : undefined;
