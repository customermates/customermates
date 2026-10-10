import { getTrashKindHandlers, getTrashRepo } from "@/core/di";
import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";
import { purgeExpiredCompanyTrash } from "@/features/trash/purge-company-trash";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

export type PurgeTrashWorkflowPayload = { companyId: string; administratorId: string; now: string };

async function purgeBatch(payload: PurgeTrashWorkflowPayload): Promise<{ hasMore: boolean }> {
  "use step";
  return runAsBackgroundTenant(payload.administratorId, () =>
    purgeExpiredCompanyTrash(
      getTrashRepo(payload.companyId),
      getTrashKindHandlers(payload.companyId),
      new Date(payload.now),
    ),
  );
}
purgeBatch.maxRetries = 3;

export async function purgeTrash(payload: PurgeTrashWorkflowPayload): Promise<void> {
  "use workflow";
  try {
    for (let batch = 0; batch < 50; batch += 1) {
      const result = await purgeBatch(payload);
      if (!result.hasMore) return;
    }
  } catch (error) {
    await reportFailure("purge-trash", toWorkflowFailure(error));
    throw error;
  }
}
