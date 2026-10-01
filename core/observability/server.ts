import { after } from "next/server";

import { isExpectedError } from "@/core/errors/app-errors";
import { errorDigest } from "@/core/errors/error-digest";
import { errorReportingEnabled } from "@/core/errors/reporting-provider";

import { currentErrorContext } from "./error-context";
import { errorReport } from "./error-report";
import { createErrorQueue } from "./error-queue";
import type { CaptureContext } from "./capture-context";

export { withScope } from "./error-context";

const reported = new WeakSet<object>();
const queue = createErrorQueue(async (report) => {
  const { publishServerError } = await import("./publish-error");
  await publishServerError(report);
});

export function captureException(error: unknown, context: CaptureContext = {}): void {
  if (!errorReportingEnabled() || isExpectedError(error)) return;
  if (process.env.NODE_ENV !== "production") {
    console.error(error);
    return;
  }
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
  if (!report) return;
  const send = queue.send(report).catch(() => undefined);
  try {
    after(() => send);
  } catch {
    void send;
  }
}

export function captureMessage(message: string, context: CaptureContext = {}): void {
  captureException(new Error(message), { ...context, level: context.level ?? currentErrorContext().level ?? "info" });
}

export const flush = (timeout?: number) => queue.flush(timeout);
