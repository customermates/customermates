import type { WorkflowTenant } from "./workflow-tenant";

import { getAgentChatRepo, getReconcileRoutineRunsInteractor } from "@/core/di";
import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";
import { resolveAgentModel } from "@/ee/agent-chat/model-catalog";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "reconcile-routine-runs";

export type ReconcileRoutineRunsWorkflowPayload = {
  ownerUserId: string;
  tenant?: WorkflowTenant;
};

async function normalizeOwnerLeasesStep(payload: ReconcileRoutineRunsWorkflowPayload): Promise<void> {
  "use step";
  await runAsBackgroundTenant(payload.ownerUserId, () =>
    getAgentChatRepo().normalizeExpiredAgentRunLease(new Date(), resolveAgentModel().modelId),
  );
}
normalizeOwnerLeasesStep.maxRetries = 0;

async function settleRoutineRunsStep(): Promise<void> {
  "use step";
  await getReconcileRoutineRunsInteractor().invoke();
}
settleRoutineRunsStep.maxRetries = 0;

export async function reconcileRoutineRuns(payload: ReconcileRoutineRunsWorkflowPayload): Promise<void> {
  "use workflow";
  const { tenant } = payload;

  try {
    await normalizeOwnerLeasesStep(payload);
    await settleRoutineRunsStep();
  } catch (err) {
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(err), tenant);
    throw err;
  }
}
