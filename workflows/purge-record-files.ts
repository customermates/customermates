import type { CompanyRecordFilePurgeBatch } from "@/features/record-files/purge-company-record-files.interactor";
import type { WorkflowTenant } from "./workflow-tenant";

import { getPurgeCompanyRecordFilesInteractor } from "@/core/di";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

export type PurgeRecordFilesWorkflowPayload = { companyId: string; now: string; tenant?: WorkflowTenant };

const MAX_PURGE_BATCHES = 100;

async function purgeRecordFilesBatch(
  payload: PurgeRecordFilesWorkflowPayload,
  detachOrphans: boolean,
): Promise<CompanyRecordFilePurgeBatch> {
  "use step";
  return getPurgeCompanyRecordFilesInteractor().invoke({
    companyId: payload.companyId,
    now: payload.now,
    detachOrphans,
  });
}
purgeRecordFilesBatch.maxRetries = 3;

export async function purgeRecordFiles(payload: PurgeRecordFilesWorkflowPayload): Promise<void> {
  "use workflow";
  try {
    let batch: CompanyRecordFilePurgeBatch = await purgeRecordFilesBatch(payload, true);
    for (let round = 1; batch.more && round < MAX_PURGE_BATCHES; round += 1)
      batch = await purgeRecordFilesBatch(payload, false);
  } catch (error) {
    await reportFailure("purge-record-files", toWorkflowFailure(error), payload.tenant);
    throw error;
  }
}
