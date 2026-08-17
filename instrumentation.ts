import * as Sentry from "@sentry/nextjs";

import { isExpectedError } from "@/core/errors/app-errors";
import { env } from "@/env";

const FORWARDED_REQUEST_HEADERS = new Set(["accept-language", "content-type", "referer", "user-agent", "x-vercel-id"]);

function stripRequestPii(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  const request = event.request;
  if (!request) return event;

  delete request.cookies;
  delete request.data;

  if (request.headers) {
    request.headers = Object.fromEntries(
      Object.entries(request.headers).filter(([name]) => FORWARDED_REQUEST_HEADERS.has(name.toLowerCase())),
    );
  }

  return event;
}

function tagRenderDigest(event: Sentry.ErrorEvent, hint: Sentry.EventHint): Sentry.ErrorEvent {
  const digest = (hint?.originalException as { digest?: unknown } | null | undefined)?.digest;
  if (typeof digest === "string") event.tags = { ...event.tags, "nextjs.digest": digest };

  return event;
}

export async function register() {
  if (env.NEXT_PUBLIC_SENTRY_DSN) {
    const init = {
      dsn: env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0,
      sendDefaultPii: false,
      beforeSend(event: Sentry.ErrorEvent, hint: Sentry.EventHint) {
        if (isExpectedError(hint?.originalException)) return null;

        if (env.NODE_ENV !== "production") {
          console.error(hint?.originalException ?? event);
          return null;
        }

        return stripRequestPii(tagRenderDigest(event, hint));
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
