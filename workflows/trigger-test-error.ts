import type { WorkflowTenant } from "./workflow-tenant";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "trigger-test-error";

export type TriggerTestErrorPayload = { message: string; tenant?: WorkflowTenant };

async function failStep(message: string): Promise<void> {
  "use step";
  await new Promise((resolve) => setTimeout(resolve, 100));
  throw new Error(message);
}
failStep.maxRetries = 0;

export async function triggerTestError(payload: TriggerTestErrorPayload): Promise<void> {
  "use workflow";
  try {
    await failStep(payload.message);
  } catch (err) {
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(err), payload.tenant);
    throw err;
  }
}
