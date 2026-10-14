import type { CompanyTrashPurgeBatch } from "@/features/trash/purge-company-trash.interactor";

import { getPurgeCompanyTrashInteractor } from "@/core/di";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

export type PurgeTrashWorkflowPayload = { companyId: string; now: string };

async function purgeBatch(
  payload: PurgeTrashWorkflowPayload,
  after: CompanyTrashPurgeBatch["next"],
): Promise<CompanyTrashPurgeBatch> {
  "use step";
  return getPurgeCompanyTrashInteractor().invoke({ companyId: payload.companyId, now: payload.now, after });
}
purgeBatch.maxRetries = 3;

export async function purgeTrash(payload: PurgeTrashWorkflowPayload): Promise<void> {
  "use workflow";
  try {
    let after: CompanyTrashPurgeBatch["next"] = null;
    do {
      const batch: CompanyTrashPurgeBatch = await purgeBatch(payload, after);
      after = batch.next;
    } while (after);
  } catch (error) {
    await reportFailure("purge-trash", toWorkflowFailure(error));
    throw error;
  }
}
