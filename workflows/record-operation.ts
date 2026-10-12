import type { WorkflowTenant } from "./workflow-tenant";

import {
  getAdvanceSystemRecordOperationInteractor,
  getFailRecordOperationInteractor,
  getRecordOperationService,
} from "@/core/di";
import { sleep } from "workflow";
import { RECORD_SYSTEM_ACTOR } from "@/features/records/record-system-actor";
import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

export type RecordOperationWorkflowPayload =
  | { operationId: string; ownerUserId: string; system?: never; tenant?: WorkflowTenant }
  | { operationId: string; ownerUserId?: never; system: { companyId: string }; tenant?: WorkflowTenant };

const STEP_BUDGET_MS = 10_000;

async function advanceRecordOperation(payload: RecordOperationWorkflowPayload): Promise<{ done: boolean }> {
  "use step";
  const startedAt = Date.now();
  let done = false;
  while (!done && Date.now() - startedAt < STEP_BUDGET_MS) done = (await advanceOnce(payload)).done;
  return { done };
}
advanceRecordOperation.maxRetries = 3;

function advanceOnce(payload: RecordOperationWorkflowPayload): Promise<{ done: boolean }> {
  if (payload.system) {
    return getAdvanceSystemRecordOperationInteractor().invoke({
      companyId: payload.system.companyId,
      operationId: payload.operationId,
    });
  }
  if (!payload.tenant || payload.ownerUserId !== payload.tenant.userId)
    throw new Error("Invalid record operation tenant");
  return runAsBackgroundTenant(payload.ownerUserId, () => {
    const service = getRecordOperationService();
    if (service.companyId !== payload.tenant?.companyId) throw new Error("Invalid record operation tenant");
    return service.advance(payload.operationId);
  });
}

async function failRecordOperation(payload: RecordOperationWorkflowPayload): Promise<void> {
  "use step";
  if (payload.system) {
    await getFailRecordOperationInteractor().invoke({
      companyId: payload.system.companyId,
      userId: RECORD_SYSTEM_ACTOR,
      operationId: payload.operationId,
    });
    return;
  }
  if (!payload.tenant || payload.ownerUserId !== payload.tenant.userId) return;
  await getFailRecordOperationInteractor().invoke({
    companyId: payload.tenant.companyId,
    userId: payload.ownerUserId,
    operationId: payload.operationId,
  });
}

export async function recordOperation(payload: RecordOperationWorkflowPayload): Promise<void> {
  "use workflow";
  try {
    while (!(await advanceRecordOperation(payload)).done) await sleep("1s");
  } catch (error) {
    await failRecordOperation(payload);
    await reportFailure("record-operation", toWorkflowFailure(error), payload.tenant);
    throw error;
  }
}
