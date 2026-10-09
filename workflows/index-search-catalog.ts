import type { WorkflowTenant } from "./workflow-tenant";

import { getSearchCatalogIndexService } from "@/core/di";
import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "index-search-catalog";
const MAX_INDEX_STEPS = 10;

export type IndexSearchCatalogWorkflowPayload = {
  userId: string;
  tenant?: WorkflowTenant;
};

async function indexSearchCatalogStep(payload: IndexSearchCatalogWorkflowPayload): Promise<boolean> {
  "use step";
  const result = await runAsBackgroundTenant(payload.userId, () => getSearchCatalogIndexService().indexPending());
  return result.remaining;
}

export async function indexSearchCatalog(payload: IndexSearchCatalogWorkflowPayload): Promise<void> {
  "use workflow";
  try {
    for (let step = 0; step < MAX_INDEX_STEPS; step += 1) if (!(await indexSearchCatalogStep(payload))) return;
  } catch (err) {
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(err), payload.tenant);
    throw err;
  }
}
