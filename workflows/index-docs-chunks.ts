import type { WorkflowTenant } from "./workflow-tenant";

import { getDocsSemanticIndexService } from "@/core/di";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "index-docs-chunks";
const MAX_INDEX_STEPS = 20;

export type IndexDocsChunksWorkflowPayload = {
  tenant?: WorkflowTenant;
};

async function indexDocsChunksStep(): Promise<boolean> {
  "use step";
  const result = await getDocsSemanticIndexService().indexPending();
  return result.remaining;
}

export async function indexDocsChunks(payload: IndexDocsChunksWorkflowPayload): Promise<void> {
  "use workflow";
  try {
    for (let step = 0; step < MAX_INDEX_STEPS; step += 1) if (!(await indexDocsChunksStep())) return;
  } catch (err) {
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(err), payload.tenant);
    throw err;
  }
}
