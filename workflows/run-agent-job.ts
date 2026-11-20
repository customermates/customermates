import type { WorkflowTenant } from "./workflow-tenant";

import { getDiscardAgentJobInteractor, getRunAgentJobInteractor } from "@/core/di";

import { asBackgroundOwner } from "./background-owner";
import { reportFailure, toWorkflowFailure } from "./capture-failure";
import { GONE } from "./owner-gone";

const WORKFLOW_NAME = "run-agent-job";

export type RunAgentJobWorkflowPayload = {
  jobId: string;
  companyId: string;
  ownerUserId: string;
  tenant?: WorkflowTenant;
};

async function runAgentJobStep(payload: RunAgentJobWorkflowPayload): Promise<void> {
  "use step";
  const outcome = await asBackgroundOwner(payload.ownerUserId, () =>
    getRunAgentJobInteractor().invoke({ jobId: payload.jobId }),
  );
  if (outcome === GONE) {
    await getDiscardAgentJobInteractor().invoke({
      jobId: payload.jobId,
      companyId: payload.companyId,
      reason: "ownerInactive",
    });
  }
}
runAgentJobStep.maxRetries = 0;

export async function runAgentJob(payload: RunAgentJobWorkflowPayload): Promise<void> {
  "use workflow";
  const { tenant } = payload;

  try {
    await runAgentJobStep(payload);
  } catch (error) {
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(error), tenant);
    throw error;
  }
}
