import { FatalError, RetryableError } from "workflow";
import { Resend } from "resend";

import { ERROR_NOTIFICATION_FAILURE_PREFIX } from "@/core/observability/error-report";
import type { ErrorReport } from "@/core/observability/error-report";

class ErrorNotificationDeliveryFailure extends RetryableError {
  constructor() {
    super(`${ERROR_NOTIFICATION_FAILURE_PREFIX} delivery failed`, { retryAfter: "5s" });
  }
}

function permanentFailure(): Error {
  return new FatalError(`${ERROR_NOTIFICATION_FAILURE_PREFIX} configuration rejected`);
}

export async function sendErrorNotification(report: ErrorReport): Promise<{ emailId: string }> {
  "use step";
  const to = process.env.ERROR_REPORTING_NOTIFICATION_EMAIL;
  const from = process.env.RESEND_OPERATOR_EMAIL;
  const key = process.env.RESEND_API_KEY;
  if (!to || !from || !key) throw permanentFailure();

  if (process.env.RESEND_BASE_URL) {
    const target = new URL(process.env.RESEND_BASE_URL);
    if (process.env.VERCEL || !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)) throw permanentFailure();
  }
  const stack = report.frames
    .map((frame) => `${frame.function ?? "<anonymous>"} (${frame.file}:${frame.line ?? "?"}:${frame.column ?? "?"})`)
    .join("\n");
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify([report.buildId, report.id])),
  );
  const idempotencyKey = `application-error/${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  const { error, data } = await new Resend(key).emails.send(
    {
      from,
      to,
      subject: `[${process.env.VERCEL_ENV ?? "local"}] ${report.name}`,
      text: [
        `${report.name}: ${report.message}`,
        `Event: ${report.id}`,
        `Build: ${report.buildId}`,
        `Source: ${report.source}`,
        `Time: ${new Date(report.timestamp * 1000).toISOString()}`,
        report.path ? `Path: ${report.path}` : "",
        report.digest ? `Render digest: ${report.digest}` : "",
        report.workflowName ? `Workflow: ${report.workflowName}` : "",
        report.tenant ? `Tenant: ${JSON.stringify(report.tenant)}` : "",
        stack,
        ...(report.causes?.map((cause) => `Caused by ${cause.name}: ${cause.message}`) ?? []),
        "Use the event ID to locate the structured Vercel log and the exact build ID for private source-map lookup.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
    {
      idempotencyKey,
    },
  );
  if (error) {
    if (
      error.statusCode &&
      error.statusCode >= 400 &&
      error.statusCode < 500 &&
      error.statusCode !== 429 &&
      error.statusCode !== 409
    )
      throw permanentFailure();
    throw new ErrorNotificationDeliveryFailure();
  }
  if (!data?.id) throw new ErrorNotificationDeliveryFailure();
  return { emailId: data.id };
}
sendErrorNotification.maxRetries = 5;

export async function notifyApplicationError(report: ErrorReport): Promise<{ emailId: string }> {
  "use workflow";
  return sendErrorNotification(report);
}
