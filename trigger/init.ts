import { tasks } from "@trigger.dev/sdk/v3";
import * as Sentry from "@sentry/node";

import { isExpectedError } from "@/core/errors/app-errors";
import { env } from "@/env";

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 0,
    beforeSend(event, hint) {
      if (isExpectedError(hint?.originalException)) return null;
      return event;
    },
  });
}

tasks.onFailure(async ({ payload, error, ctx }) => {
  if (!env.SENTRY_DSN) return;
  if (isExpectedError(error)) return;

  Sentry.withScope((scope) => {
    scope.setContext("trigger", {
      taskId: ctx.task.id,
      runId: ctx.run.id,
      attempt: ctx.attempt.number,
    });
    scope.setExtra("payload", payload);
    Sentry.captureException(error);
  });
  await Sentry.flush(2000);
});
