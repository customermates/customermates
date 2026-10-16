import type { CompanyPhoneIdentityBatch } from "@/features/records/normalize-company-phone-identities.interactor";
import type { WorkflowTenant } from "./workflow-tenant";

import { getNormalizeCompanyPhoneIdentitiesInteractor } from "@/core/di";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

export type NormalizePhoneIdentitiesWorkflowPayload = { companyId: string; tenant?: WorkflowTenant };

const MAX_NORMALIZE_BATCHES = 500;

async function normalizePhoneIdentitiesBatch(
  payload: NormalizePhoneIdentitiesWorkflowPayload,
  after: string | null,
): Promise<CompanyPhoneIdentityBatch> {
  "use step";
  return getNormalizeCompanyPhoneIdentitiesInteractor().invoke({ companyId: payload.companyId, after });
}
normalizePhoneIdentitiesBatch.maxRetries = 3;

export async function normalizePhoneIdentities(payload: NormalizePhoneIdentitiesWorkflowPayload): Promise<void> {
  "use workflow";
  try {
    let after: string | null = null;
    for (let round = 0; round < MAX_NORMALIZE_BATCHES; round += 1) {
      const batch: CompanyPhoneIdentityBatch = await normalizePhoneIdentitiesBatch(payload, after);
      if (!batch.next) return;
      after = batch.next;
    }
  } catch (error) {
    await reportFailure("normalize-phone-identities", toWorkflowFailure(error), payload.tenant);
    throw error;
  }
}
