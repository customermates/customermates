"use server";

import { tasks } from "@trigger.dev/sdk/v3";

import { type sentryTestFailure } from "@/trigger/sentry-test";

export async function triggerServerErrorAction() {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  throw new Error("Test server-side error from server action");
}

export async function dispatchTriggerFailureAction(): Promise<{ runId: string }> {
  const handle = await tasks.trigger<typeof sentryTestFailure>("sentry-test-failure", {
    reason: "triggered from /test/error page",
  });
  return { runId: handle.id };
}
