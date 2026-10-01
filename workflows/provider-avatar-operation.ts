import type { WorkflowTenant } from "./workflow-tenant";
import { getProviderAvatarService } from "@/core/di";
import { reportFailure, toWorkflowFailure } from "./capture-failure";

export type ProviderAvatarOperationPayload = { companyId: string; operationId: string; tenant?: WorkflowTenant };

async function advance(payload: ProviderAvatarOperationPayload) {
  "use step";
  return getProviderAvatarService(payload.companyId).advance(payload.operationId);
}
advance.maxRetries = 3;

async function fail(payload: ProviderAvatarOperationPayload) {
  "use step";
  await getProviderAvatarService(payload.companyId).fail(payload.operationId);
}

export async function providerAvatarOperation(payload: ProviderAvatarOperationPayload) {
  "use workflow";
  try {
    let done = false;
    while (!done) done = (await advance(payload)).done;
  } catch (error) {
    await fail(payload);
    await reportFailure("provider-avatar-operation", toWorkflowFailure(error), payload.tenant);
    throw error;
  }
}
