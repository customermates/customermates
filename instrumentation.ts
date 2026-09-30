import * as Sentry from "@sentry/nextjs";

import { isExpectedError } from "@/core/errors/app-errors";
import { errorDigest } from "@/core/errors/error-digest";
import { env } from "@/env";
import { scrubAdIdentifiersFromEvent } from "@/core/errors/scrub-ad-identifiers";
import { errorReportingDsn, errorReportingEnabled, usesVercelErrorReporting } from "@/core/errors/reporting-provider";

export async function register() {
  if (errorReportingEnabled() && (env.NEXT_RUNTIME === "nodejs" || env.NEXT_RUNTIME === "edge")) {
    const transport = usesVercelErrorReporting() ? await import("@/core/observability/vercel-transport") : undefined;
    const publisher =
      transport && process.env.NEXT_RUNTIME === "nodejs"
        ? await import("@/core/observability/publish-error")
        : undefined;
    if (transport && !publisher) throw new Error("Vercel error reporting requires the Node.js runtime");
    Sentry.init({
      dsn: errorReportingDsn(),
      ...(transport && publisher
        ? { transport: () => transport.createVercelErrorTransport("server", publisher.publishServerError) }
        : {}),
      tracesSampleRate: 0,
      integrations: [Sentry.requestDataIntegration({ include: { cookies: false, data: false, headers: false } })],
      beforeSend(event: Sentry.ErrorEvent, hint: Sentry.EventHint) {
        if (isExpectedError(hint?.originalException)) return null;

        if (env.NODE_ENV !== "production") {
          console.error(hint?.originalException ?? event);
          return null;
        }

        return scrubAdIdentifiersFromEvent(event);
      },
    } satisfies Sentry.NodeOptions);
  }

  if (env.NEXT_RUNTIME === "nodejs" && env.WORKFLOW_TARGET_WORLD) {
    try {
      const { getWorld } = await import("workflow/runtime");
      const world = await getWorld();
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

export const onRequestError: typeof Sentry.captureRequestError = (...args) => {
  if (usesVercelErrorReporting() && args[1].path.startsWith("/api/observability/errors")) return;
  if (usesVercelErrorReporting()) {
    return Sentry.withScope((scope) => {
      const digest = errorDigest(args[0]);
      if (digest) scope.setTag("digest", digest);
      return Sentry.captureRequestError(...args);
    });
  }
  return Sentry.captureRequestError(...args);
};
