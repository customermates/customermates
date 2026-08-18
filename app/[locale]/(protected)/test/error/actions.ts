"use server";

import { getBackgroundTaskService, getUserService } from "@/core/di";
import { runWithTenant } from "@/core/decorators/tenant-context";

export async function triggerServerErrorAction() {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  throw new Error("Test server-side error from server action");
}

export async function triggerWorkflowErrorAction() {
  const user = await getUserService().getActiveUserOrThrow();

  await runWithTenant(user, () =>
    getBackgroundTaskService().dispatch("trigger-test-error", {
      message: "Test workflow error from background job - should trigger reportFailure + Sentry",
    }),
  );
}
