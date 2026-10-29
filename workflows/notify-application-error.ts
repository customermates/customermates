import { FatalError, RetryableError } from "workflow";
import { Resend } from "resend";

import { ERROR_NOTIFICATION_FAILURE_PREFIX } from "@/core/observability/error-report";
import type { ErrorReport } from "@/core/observability/error-report";

function retryableDeliveryFailure(): RetryableError {
  return new RetryableError(`${ERROR_NOTIFICATION_FAILURE_PREFIX} delivery failed`, { retryAfter: "5s" });
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

export async function sendErrorNotification(
  report: ErrorReport,
): Promise<{ emailId: string; verifyDelivery?: true } | { duplicate: true }> {
  "use step";
  const to = process.env.ERROR_REPORTING_NOTIFICATION_EMAIL;
  const from = process.env.RESEND_OPERATOR_EMAIL;
  const key = process.env.RESEND_API_KEY;
  if (!to || !from || !key) throw permanentFailure();
  const verifyDelivery = verifiesPreviewDelivery();
  if (verifyDelivery && !isAutomatedDeliveredSink(to)) throw permanentFailure();

  if (process.env.RESEND_BASE_URL) {
    const target = new URL(process.env.RESEND_BASE_URL);
    if (process.env.VERCEL || !isLoopbackTarget(target)) throw permanentFailure();
  }
  const stack = report.frames
    .map((frame) => `${frame.function ?? "<anonymous>"} (${frame.file}:${frame.line ?? "?"}:${frame.column ?? "?"})`)
    .join("\n");
  const day = new Date(report.timestamp * 1000).toISOString().slice(0, 10);
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify(report.fingerprint ? [day, report.fingerprint] : [report.buildId, report.id]),
    ),
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
        "Only the first occurrence of an error each UTC day is emailed, within a daily email limit; every occurrence is in Vercel Runtime Logs.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
    {
      idempotencyKey,
    },
  );
  if (error?.statusCode === 409 && report.fingerprint) return { duplicate: true };
  if (error) {
    if (
      error.statusCode &&
      error.statusCode >= 400 &&
      error.statusCode < 500 &&
      error.statusCode !== 429 &&
      error.statusCode !== 409
    )
      throw permanentFailure();
    throw retryableDeliveryFailure();
  }
  if (!data?.id) throw retryableDeliveryFailure();
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
  if (error || !data) throw retryableDeliveryFailure();
  if (data.last_event === "failed" || data.last_event === "bounced" || data.last_event === "canceled")
    throw permanentFailure();
  if (data.last_event !== "delivered") throw retryableDeliveryFailure();
}
verifyPreviewErrorDelivery.maxRetries = 5;

export type ErrorNotificationChannels = { email: boolean; webhook: boolean };

function isLoopbackTarget(target: URL): boolean {
  return ["127.0.0.1", "localhost", "[::1]"].includes(target.hostname);
}

export async function deliverErrorWebhook(report: ErrorReport): Promise<void> {
  "use step";
  const url = process.env.ERROR_REPORTING_WEBHOOK_URL;
  const secret = process.env.ERROR_REPORTING_WEBHOOK_SECRET;
  if (!url || !secret || !report.fingerprint) throw permanentFailure();
  const target = new URL(url);
  if (target.protocol !== "https:" && !(isLoopbackTarget(target) && !process.env.VERCEL)) throw permanentFailure();
  const body = JSON.stringify({
    kind: "application-error",
    fingerprint: report.fingerprint,
    day: new Date(report.timestamp * 1000).toISOString().slice(0, 10),
    environment: process.env.VERCEL_ENV ?? "local",
    report,
  });
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const response = await fetch(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-customermates-signature": `sha256=${Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("")}`,
    },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!response) throw retryableDeliveryFailure();
  if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429)
    throw permanentFailure();
  if (!response.ok) throw retryableDeliveryFailure();
}
deliverErrorWebhook.maxRetries = 5;

export async function notifyApplicationError(
  report: ErrorReport,
  channels: ErrorNotificationChannels = { email: true, webhook: false },
): Promise<{ emailId: string; delivery?: "delivered" } | { duplicate: true } | null> {
  "use workflow";
  if (channels.webhook) await deliverErrorWebhook(report);
  if (!channels.email) return null;
  const result = await sendErrorNotification(report);
  if ("duplicate" in result) return result;
  if (result.verifyDelivery) {
    await verifyPreviewErrorDelivery(result.emailId);
    return { emailId: result.emailId, delivery: "delivered" };
  }
  return { emailId: result.emailId };
}
