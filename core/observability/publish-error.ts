import "server-only";

import { start } from "workflow/api";

import { notifyApplicationError } from "@/workflows/notify-application-error";

import type { ErrorReport } from "./error-report";

const writeError = console.error.bind(console);
const writeWarning = console.warn.bind(console);
const writeInfo = console.info.bind(console);

export async function publishServerError(report: ErrorReport, notify = true): Promise<void> {
  const write = report.level === "error" ? writeError : report.level === "warning" ? writeWarning : writeInfo;
  write(JSON.stringify(report));
  if (!notify || report.level !== "error" || !process.env.ERROR_REPORTING_NOTIFICATION_EMAIL) return;

  try {
    const run = await start(notifyApplicationError, [report]);
    writeInfo(
      JSON.stringify({ kind: "error-notification-enqueued", id: report.id, buildId: report.buildId, runId: run.runId }),
    );
  } catch (error) {
    writeWarning(JSON.stringify({ kind: "error-notification-enqueue-failed", id: report.id, buildId: report.buildId }));
    throw error;
  }
}
