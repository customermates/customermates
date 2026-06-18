"use server";

import { getBackgroundTaskService } from "@/core/di";

export async function triggerServerErrorAction() {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  throw new Error("Test server-side error from server action");
}

export async function triggerWorkflowErrorAction() {
  await getBackgroundTaskService().dispatch("trigger-test-error", {
    message: "Test workflow error from background job - should trigger reportFailure + Sentry",
  });
}
