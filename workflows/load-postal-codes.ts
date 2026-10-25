import type { WorkflowTenant } from "./workflow-tenant";

import { getPostalCodeService } from "@/core/di";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

export type LoadPostalCodesWorkflowPayload = { countryCode: string; tenant?: WorkflowTenant };

async function loadPostalCodesStep(countryCode: string): Promise<string> {
  "use step";
  return (await getPostalCodeService().load(countryCode)).status;
}
loadPostalCodesStep.maxRetries = 2;

export async function loadPostalCodes(payload: LoadPostalCodesWorkflowPayload): Promise<void> {
  "use workflow";
  try {
    await loadPostalCodesStep(payload.countryCode);
  } catch (error) {
    await reportFailure("load-postal-codes", toWorkflowFailure(error), payload.tenant);
    throw error;
  }
}
