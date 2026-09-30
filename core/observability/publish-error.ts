import "server-only";

import { start } from "workflow/api";

import { notifyApplicationError } from "@/workflows/notify-application-error";

import type { ErrorReport } from "./error-report";

const writeError = console.error.bind(console);
const writeWarning = console.warn.bind(console);

export async function publishServerError(report: ErrorReport): Promise<void> {
  const write = report.level === "error" ? writeError : writeWarning;
  write(JSON.stringify(report));
  if (report.level !== "error" || !process.env.ERROR_REPORTING_NOTIFICATION_EMAIL) return;

  try {
    await start(notifyApplicationError, [report]);
  } catch (error) {
    writeWarning(JSON.stringify({ kind: "error-notification-enqueue-failed", id: report.id, buildId: report.buildId }));
    throw error;
  }
}
