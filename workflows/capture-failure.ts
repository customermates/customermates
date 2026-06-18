import * as Sentry from "@sentry/nextjs";

import { env } from "@/env";
import { isExpectedError } from "@/core/errors/app-errors";

export type WorkflowFailure = { name?: string; message?: string; stack?: string; expected?: boolean };

export function toWorkflowFailure(err: unknown): WorkflowFailure {
  const e = err as WorkflowFailure;
  return { name: e?.name, message: e?.message ?? String(err), stack: e?.stack, expected: isExpectedError(err) };
}

export async function reportFailure(workflowName: string, failure: WorkflowFailure): Promise<void> {
  "use step";
  if (failure.expected) return;

  const error = new Error(failure.message || "Workflow failed");
  if (failure.name) error.name = failure.name;
  if (failure.stack) error.stack = failure.stack;

  // Locally (or without a DSN): log to the console instead of publishing to Sentry.
  if (env.NODE_ENV !== "production" || !env.NEXT_PUBLIC_SENTRY_DSN) {
    console.error(`[workflow:${workflowName}]`, error);
    return;
  }

  try {
    Sentry.withScope((scope) => {
      scope.setContext("workflow", { workflowName });
      Sentry.captureException(error);
    });
    await Sentry.flush(2000);
  } catch (reportingError) {
    console.error(`[workflow:${workflowName}] failed to report failure to Sentry`, reportingError);
  }
}
reportFailure.maxRetries = 0;
