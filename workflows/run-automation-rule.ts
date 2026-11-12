import type { WorkflowTenant } from "./workflow-tenant";

import { getDiscardAutomationRuleRunInteractor, getRunAutomationRuleInteractor } from "@/core/di";

import { asBackgroundOwner } from "./background-owner";
import { reportFailure, toWorkflowFailure } from "./capture-failure";
import { GONE } from "./owner-gone";

const WORKFLOW_NAME = "run-automation-rule";

export type RunAutomationRuleWorkflowPayload = {
  runId: string;
  companyId: string;
  ownerUserId: string;
  tenant?: WorkflowTenant;
};

async function runAutomationRuleStep(payload: RunAutomationRuleWorkflowPayload): Promise<void> {
  "use step";
  const outcome = await asBackgroundOwner(payload.ownerUserId, () =>
    getRunAutomationRuleInteractor().invoke({ runId: payload.runId }),
  );
  if (outcome === GONE)
    await getDiscardAutomationRuleRunInteractor().invoke({
      runId: payload.runId,
      companyId: payload.companyId,
      reason: "ownerInactive",
    });
}
runAutomationRuleStep.maxRetries = 0;

export async function runAutomationRule(payload: RunAutomationRuleWorkflowPayload): Promise<void> {
  "use workflow";
  const { tenant } = payload;

  try {
    await runAutomationRuleStep(payload);
  } catch (error) {
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(error), tenant);
    throw error;
  }
}
