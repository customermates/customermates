import { captureException } from "@/core/observability/browser";
import { errorReportingEnabled } from "@/core/errors/reporting-provider";

if (errorReportingEnabled() && typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    captureException(event.error ?? event.message, {
      frames:
        !event.error && event.filename
          ? [{ file: event.filename, line: event.lineno, column: event.colno }]
          : undefined,
    });
  });
  window.addEventListener("unhandledrejection", (event) => captureException(event.reason));
}
