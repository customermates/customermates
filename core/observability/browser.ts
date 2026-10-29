import { isExpectedError } from "@/core/errors/app-errors";
import { errorDigest } from "@/core/errors/error-digest";
import { errorReportingEnabled } from "@/core/errors/reporting-provider";
import { isWorkspaceChangedError } from "@/core/errors/workspace-changed";
import { isClientTransportError } from "@/core/errors/client-transport-error";
import { isDeploymentSkewError } from "@/core/errors/deployment-skew";

import { errorReport } from "./error-report";
import { createErrorQueue } from "./error-queue";
import type { CaptureContext } from "./capture-context";
import type { ErrorReport } from "./error-report";

const reported = new WeakSet<object>();
const queue = createErrorQueue(publishBrowserError, 60_000);

export async function publishBrowserError(report: ErrorReport): Promise<void> {
  const response = await fetch("/api/observability/errors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(report),
    credentials: "same-origin",
    keepalive: true,
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Error report was not accepted");
}

const NEXT_CONTROL_FLOW_DIGEST = /^(NEXT_HTTP_ERROR_FALLBACK;|NEXT_REDIRECT|NEXT_NOT_FOUND)/;

function isBrowserNoise(error: unknown): boolean {
  if (isClientTransportError(error) || isDeploymentSkewError(error)) return true;
  if (NEXT_CONTROL_FLOW_DIGEST.test(errorDigest(error) ?? "")) return true;
  const stack = error instanceof Error ? error.stack : undefined;
  return typeof stack === "string" && stack.includes("ext:core/");
}

export function captureException(error: unknown, context: CaptureContext = {}): void {
  if (!errorReportingEnabled() || isExpectedError(error) || isWorkspaceChangedError(error) || isBrowserNoise(error))
    return;
  const message = typeof error === "string" ? error : error instanceof Error ? error.message : undefined;
  if (
    message === "ResizeObserver loop limit exceeded" ||
    message === "ResizeObserver loop completed with undelivered notifications."
  )
    return;
  if (process.env.NODE_ENV !== "production") return;
  if (error && typeof error === "object") {
    if (reported.has(error)) return;
    reported.add(error);
  }
  const report = errorReport(error, "browser", {
    ...context,
    path: typeof window !== "undefined" ? window.location.pathname : undefined,
    digest: errorDigest(error) ?? undefined,
  });
  if (report) void queue.send(report).catch(() => undefined);
}

export const flush = (timeout?: number) => queue.flush(timeout);
