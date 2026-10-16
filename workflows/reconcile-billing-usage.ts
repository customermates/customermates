import { getReconcileWorkspaceBillingUsageInteractor } from "@/core/di";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

export type ReconcileBillingUsageWorkflowPayload = { companyId: string };

async function reconcileWorkspace(payload: ReconcileBillingUsageWorkflowPayload): Promise<void> {
  "use step";
  await getReconcileWorkspaceBillingUsageInteractor().invoke({ companyId: payload.companyId });
}
reconcileWorkspace.maxRetries = 3;

export async function reconcileBillingUsage(payload: ReconcileBillingUsageWorkflowPayload): Promise<void> {
  "use workflow";
  try {
    await reconcileWorkspace(payload);
  } catch (error) {
    await reportFailure("reconcile-billing-usage", toWorkflowFailure(error));
    throw error;
  }
}
