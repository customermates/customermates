import { FatalError, RetryableError } from "workflow";
import { Resend } from "resend";

import { ERROR_NOTIFICATION_FAILURE_PREFIX } from "@/core/observability/error-report";
import type { ErrorReport } from "@/core/observability/error-report";

class ErrorNotificationDeliveryFailure extends RetryableError {
  constructor() {
    super(`${ERROR_NOTIFICATION_FAILURE_PREFIX} delivery failed`, {
      retryAfter: "5s",
    });
  }
}

function permanentFailure(): Error {
  return new FatalError(`${ERROR_NOTIFICATION_FAILURE_PREFIX} configuration rejected`);
}

function verifiesPreviewDelivery(): boolean {
  return (
    process.env.VERCEL_ENV === "preview" &&
    (!process.env.VERCEL_TARGET_ENV || process.env.VERCEL_TARGET_ENV === "preview") &&
    process.env.ERROR_REPORTING_VERIFY_DELIVERY === "true"
  );
}

function isAutomatedDeliveredSink(to: string): boolean {
  return /^delivered(?:\+[a-zA-Z0-9_-]+)?@resend\.dev$/.test(to);
}

export async function sendErrorNotification(report: ErrorReport): Promise<{ emailId: string; verifyDelivery?: true }> {
  "use step";
  const to = process.env.ERROR_REPORTING_NOTIFICATION_EMAIL;
  const from = process.env.RESEND_OPERATOR_EMAIL;
  const key = process.env.RESEND_API_KEY;
  if (!to || !from || !key) throw permanentFailure();
  const verifyDelivery = verifiesPreviewDelivery();
  if (verifyDelivery && !isAutomatedDeliveredSink(to)) throw permanentFailure();

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
        report.release ? `Commit: ${report.release}` : "",
        `Source: ${report.source}`,
        `Time: ${new Date(report.timestamp * 1000).toISOString()}`,
        report.path ? `Path: ${report.path}` : "",
        report.digest ? `Render digest: ${report.digest}` : "",
        report.workflowName ? `Workflow: ${report.workflowName}` : "",
        report.tags ? `Context: ${JSON.stringify(report.tags)}` : "",
        report.tenant ? `Tenant: ${JSON.stringify(report.tenant)}` : "",
        stack,
        ...(report.causes?.map((cause) => `Caused by ${cause.name}: ${cause.message}`) ?? []),
        "Search Vercel Runtime Logs for the event ID. Use the deployment commit, path and operation context to investigate.",
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
  return verifyDelivery ? { emailId: data.id, verifyDelivery: true } : { emailId: data.id };
}
sendErrorNotification.maxRetries = 5;

export async function verifyPreviewErrorDelivery(emailId: string): Promise<void> {
  "use step";
  const key = process.env.RESEND_API_KEY;
  const to = process.env.ERROR_REPORTING_NOTIFICATION_EMAIL;
  if (!verifiesPreviewDelivery() || !key || !to || !isAutomatedDeliveredSink(to)) throw permanentFailure();
  const { data, error } = await new Resend(key).emails.get(emailId);
  if (error?.statusCode === 401 || error?.statusCode === 403) throw permanentFailure();
  if (error || !data) throw new ErrorNotificationDeliveryFailure();
  if (data.last_event === "failed" || data.last_event === "bounced" || data.last_event === "canceled")
    throw permanentFailure();
  if (data.last_event !== "delivered") throw new ErrorNotificationDeliveryFailure();
}
verifyPreviewErrorDelivery.maxRetries = 5;

export async function notifyApplicationError(
  report: ErrorReport,
): Promise<{ emailId: string; delivery?: "delivered" }> {
  "use workflow";
  const result = await sendErrorNotification(report);
  if (result.verifyDelivery) {
    await verifyPreviewErrorDelivery(result.emailId);
    return { emailId: result.emailId, delivery: "delivered" };
  }
  return { emailId: result.emailId };
}
