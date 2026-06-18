import * as Sentry from "@sentry/nextjs";

import { isExpectedError } from "@/core/errors/app-errors";
import { env } from "@/env";

export async function register() {
  if (env.NEXT_PUBLIC_SENTRY_DSN) {
    const init = {
      dsn: env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0,
      beforeSend(event: Sentry.ErrorEvent, hint: Sentry.EventHint) {
        if (isExpectedError(hint?.originalException)) return null;

        if (env.NODE_ENV !== "production") {
          console.error(hint?.originalException ?? event);
          return null;
        }

        return event;
      },
    } satisfies Sentry.NodeOptions;

    if (env.NEXT_RUNTIME === "nodejs") Sentry.init(init);
    if (env.NEXT_RUNTIME === "edge") Sentry.init(init);
  }

  if (env.NEXT_RUNTIME === "nodejs" && env.WORKFLOW_TARGET_WORLD) {
    try {
      const { getWorld } = await import("workflow/runtime");
      const world = getWorld();
      await world.start?.();
    } catch (error) {
      console.error(
        "[instrumentation] workflow world.start() failed. Run `yarn workflow:setup` to create/migrate the workflow schema.",
        error,
      );
      if (env.NODE_ENV === "production") throw error;
    }
  }
}

export const onRequestError = Sentry.captureRequestError;
