import { errorReportingEnabled } from "./reporting-provider";

export function captureError(error: unknown): void {
  if (!errorReportingEnabled()) return;
  void import("@/core/observability/browser").then((loaded) => loaded.captureException(error)).catch(() => undefined);
}
