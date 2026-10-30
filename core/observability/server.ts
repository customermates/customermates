import { errorDigest } from "@/core/errors/error-digest";
import { errorReportingEnabled } from "@/core/errors/reporting-provider";
import { isReportableError } from "@/core/errors/reportable-error";

import { currentErrorContext } from "./error-context";
import { errorReport } from "./error-report";
import { publishServerError } from "./publish-error";
import type { CaptureContext } from "./capture-context";

export { withScope } from "./error-context";

const reported = new WeakSet<object>();

export function captureException(error: unknown, context: CaptureContext = {}): void {
  if (!errorReportingEnabled() || !isReportableError(error)) return;
  if (error && typeof error === "object") {
    if (reported.has(error)) return;
    reported.add(error);
  }
  const parent = currentErrorContext(error);
  const report = errorReport(error, "server", {
    ...parent,
    ...context,
    digest: context.digest ?? errorDigest(error) ?? undefined,
    tags: { ...parent.tags, ...context.tags },
    contexts: { ...parent.contexts, ...context.contexts },
  });
  if (report) publishServerError(report);
}

export function captureMessage(message: string, context: CaptureContext = {}): void {
  captureException(new Error(message), { ...context, level: context.level ?? currentErrorContext().level ?? "info" });
}
