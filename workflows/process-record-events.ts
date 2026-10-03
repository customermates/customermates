import { getProcessDueRecordEventsInteractor } from "@/core/di";
import { reportFailure, toWorkflowFailure } from "./capture-failure";
import type { WorkflowTenant } from "./workflow-tenant";

export type ProcessRecordEventsWorkflowPayload = { companyId: string; tenant?: WorkflowTenant };

async function processBatch(payload: { companyId: string }): Promise<{ hasMore: boolean }> {
  "use step";
  return getProcessDueRecordEventsInteractor().invoke(payload);
}
processBatch.maxRetries = 3;

export async function processRecordEvents(payload: ProcessRecordEventsWorkflowPayload): Promise<void> {
  "use workflow";
  const { tenant, ...input } = payload;
  try {
    for (let batch = 0; batch < 20; batch += 1) {
      const result = await processBatch(input);
      if (!result.hasMore) return;
    }
  } catch (error) {
    await reportFailure("process-record-events", toWorkflowFailure(error), tenant);
    throw error;
  }
}
