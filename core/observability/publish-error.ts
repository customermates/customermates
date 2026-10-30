import "server-only";

import { start } from "workflow/api";

import { notifyApplicationError } from "@/workflows/notify-application-error";
import { logRuntimeEvent } from "@/core/utils/audit-log";

import { claimErrorNotification } from "./error-notification-claim";
import type { ErrorReport } from "./error-report";

export async function publishServerError(report: ErrorReport, notify = true): Promise<void> {
  logRuntimeEvent(report);
  if (!notify || report.level !== "error" || !process.env.ERROR_REPORTING_NOTIFICATION_EMAIL) return;
  const fingerprint = claimErrorNotification(report);
  if (!fingerprint) return;

  try {
    const run = await start(notifyApplicationError, [{ ...report, fingerprint }]);
    logRuntimeEvent({
      level: "info",
      kind: "error-notification-enqueued",
      id: report.id,
      buildId: report.buildId,
      runId: run.runId,
    });
  } catch (error) {
    logRuntimeEvent({
      level: "warning",
      kind: "error-notification-enqueue-failed",
      id: report.id,
      buildId: report.buildId,
    });
    throw error;
  }
}
