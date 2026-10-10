import type { TrashExpiryCursor } from "@/features/trash/trash.repo";
import type { CompanyTrashPurgeBatch } from "@/features/trash/purge-company-trash";

import { getTrashKindHandlers, getTrashRepo } from "@/core/di";
import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";
import { purgeExpiredCompanyTrash } from "@/features/trash/purge-company-trash";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

export type PurgeTrashWorkflowPayload = { companyId: string; actorUserId: string; now: string };

async function purgeBatch(
  payload: PurgeTrashWorkflowPayload,
  after: TrashExpiryCursor | null,
): Promise<CompanyTrashPurgeBatch> {
  "use step";
  return runAsBackgroundTenant(
    payload.actorUserId,
    () =>
      purgeExpiredCompanyTrash(
        getTrashRepo(payload.companyId),
        getTrashKindHandlers(payload.companyId),
        new Date(payload.now),
        after ?? undefined,
      ),
    { allowInactive: true },
  );
}
purgeBatch.maxRetries = 3;

export async function purgeTrash(payload: PurgeTrashWorkflowPayload): Promise<void> {
  "use workflow";
  try {
    let after: TrashExpiryCursor | null = null;
    do {
      const batch: CompanyTrashPurgeBatch = await purgeBatch(payload, after);
      after = batch.next;
    } while (after);
  } catch (error) {
    await reportFailure("purge-trash", toWorkflowFailure(error));
    throw error;
  }
}
