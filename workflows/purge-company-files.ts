import { getPurgeCompanyFileObjectsInteractor } from "@/core/di";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

export type PurgeCompanyFilesWorkflowPayload = { companyId: string };

async function purgeCompanyFileObjects(payload: PurgeCompanyFilesWorkflowPayload): Promise<number> {
  "use step";
  return (await getPurgeCompanyFileObjectsInteractor().invoke({ companyId: payload.companyId })).deleted;
}
purgeCompanyFileObjects.maxRetries = 3;

export async function purgeCompanyFiles(payload: PurgeCompanyFilesWorkflowPayload): Promise<void> {
  "use workflow";
  try {
    await purgeCompanyFileObjects(payload);
  } catch (error) {
    await reportFailure("purge-company-files", toWorkflowFailure(error));
    throw error;
  }
}
