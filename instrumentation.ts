import * as Sentry from "@sentry/nextjs";

import { IS_CLOUD_HOSTED, IS_DEMO_MODE, IS_PRODUCTION } from "@/constants/env";

export function register() {
  const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

  if (IS_PRODUCTION && !IS_DEMO_MODE && IS_CLOUD_HOSTED && SENTRY_DSN) {
    Sentry.init({
      dsn: SENTRY_DSN,
      tracesSampleRate: 1,
      debug: false,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
