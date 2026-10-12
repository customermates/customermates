import { getProcessDueEventsInteractor } from "@/core/di";
import { reportFailure, toWorkflowFailure } from "./capture-failure";
import type { WorkflowTenant } from "./workflow-tenant";

export type ProcessEventsWorkflowPayload = { companyId: string; tenant?: WorkflowTenant };

async function processBatch(payload: { companyId: string }): Promise<{ processed: number; continued: boolean }> {
  "use step";
  return getProcessDueEventsInteractor().invoke(payload);
}
processBatch.maxRetries = 3;

export async function processEvents(payload: ProcessEventsWorkflowPayload): Promise<void> {
  "use workflow";
  const { tenant, ...input } = payload;
  try {
    await processBatch(input);
  } catch (error) {
    await reportFailure("process-events", toWorkflowFailure(error), tenant);
    throw error;
  }
}
