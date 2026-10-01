import type { Instrumentation } from "next";

import { env } from "@/env";
import { errorReportingEnabled } from "@/core/errors/reporting-provider";

export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    !process.env.VERCEL &&
    env.NODE_ENV === "production" &&
    errorReportingEnabled()
  ) {
    const reporter = await import("@/core/observability/server");
    const { installProcessErrorHandlers } = await import("@/core/observability/process-errors");
    installProcessErrorHandlers(reporter);
  }
  if (process.env.NEXT_RUNTIME === "nodejs" && env.WORKFLOW_TARGET_WORLD) {
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

export const onRequestError: Instrumentation.onRequestError = async (error, request) => {
  if (!errorReportingEnabled() || request.path.startsWith("/api/observability/errors")) return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { captureException, flush } = await import("@/core/observability/server");
  const { currentErrorContext } = await import("@/core/observability/error-context");
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers))
    if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  const parent = currentErrorContext(error);
  const context = parent.user?.id
    ? parent
    : (await (await import("@/core/observability/request-context")).requestErrorContext(headers)).context;
  captureException(error, { ...context, path: request.path });
  await flush(2000);
};
