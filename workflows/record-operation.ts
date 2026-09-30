import type { WorkflowTenant } from "./workflow-tenant";

import { getRecordOperationService, getRecordRepo } from "@/core/di";
import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

export type RecordOperationWorkflowPayload = { operationId: string; ownerUserId: string; tenant?: WorkflowTenant };

async function advanceRecordOperation(payload: RecordOperationWorkflowPayload): Promise<{ done: boolean }> {
  "use step";
  if (!payload.tenant || payload.ownerUserId !== payload.tenant.userId)
    throw new Error("Invalid record operation tenant");
  return runAsBackgroundTenant(payload.ownerUserId, () => {
    const service = getRecordOperationService();
    if (service.companyId !== payload.tenant?.companyId) throw new Error("Invalid record operation tenant");
    return service.advance(payload.operationId);
  });
}
advanceRecordOperation.maxRetries = 3;

async function failRecordOperation(payload: RecordOperationWorkflowPayload): Promise<void> {
  "use step";
  if (!payload.tenant || payload.ownerUserId !== payload.tenant.userId) return;
  await getRecordRepo().failOperationUnscoped({
    companyId: payload.tenant.companyId,
    userId: payload.ownerUserId,
    operationId: payload.operationId,
  });
}

export async function recordOperation(payload: RecordOperationWorkflowPayload): Promise<void> {
  "use workflow";
  try {
    let done = false;
    while (!done) done = (await advanceRecordOperation(payload)).done;
  } catch (error) {
    await failRecordOperation(payload);
    await reportFailure("record-operation", toWorkflowFailure(error), payload.tenant);
    throw error;
  }
}
