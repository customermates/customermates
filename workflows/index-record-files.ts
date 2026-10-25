import type { WorkflowTenant } from "./workflow-tenant";

import { getIndexRecordFilesInteractor } from "@/core/di";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "index-record-files";
const MAX_INDEX_STEPS = 25;

export type IndexRecordFilesWorkflowPayload = {
  companyId: string;
  tenant?: WorkflowTenant;
};

async function indexRecordFilesStep(payload: IndexRecordFilesWorkflowPayload): Promise<boolean> {
  "use step";
  const result = await getIndexRecordFilesInteractor().invoke({ companyId: payload.companyId });
  return result.remaining;
}

export async function indexRecordFiles(payload: IndexRecordFilesWorkflowPayload): Promise<void> {
  "use workflow";
  try {
    for (let step = 0; step < MAX_INDEX_STEPS; step += 1) if (!(await indexRecordFilesStep(payload))) return;
  } catch (err) {
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(err), payload.tenant);
    throw err;
  }
}
