"use server";

import { type sentryTestFailure } from "@/trigger/sentry-test";

import { getBackgroundTaskService } from "@/core/app-di";

export async function triggerServerErrorAction() {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  throw new Error("Test server-side error from server action");
}

export async function dispatchTriggerFailureAction(): Promise<{ runId: string | null }> {
  const result = await getBackgroundTaskService().dispatch<typeof sentryTestFailure>("sentry-test-failure", {
    reason: "triggered from /test/error page",
  });
  return { runId: result?.runId ?? null };
}
