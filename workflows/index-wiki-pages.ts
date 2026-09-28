import type { WorkflowTenant } from "./workflow-tenant";

import { getWikiSemanticIndexService } from "@/core/di";
import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "index-wiki-pages";
const MAX_INDEX_BATCHES = 25;

export type IndexWikiPagesWorkflowPayload = {
  userId: string;
  tenant?: WorkflowTenant;
};

async function indexWikiPagesStep(payload: IndexWikiPagesWorkflowPayload): Promise<boolean> {
  "use step";
  const result = await runAsBackgroundTenant(payload.userId, () => getWikiSemanticIndexService().indexStalePages());
  return result.remaining;
}

export async function indexWikiPages(payload: IndexWikiPagesWorkflowPayload): Promise<void> {
  "use workflow";
  try {
    for (let batch = 0; batch < MAX_INDEX_BATCHES; batch += 1) if (!(await indexWikiPagesStep(payload))) return;
  } catch (err) {
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(err), payload.tenant);
    throw err;
  }
}
