import type { WorkflowTenant } from "./workflow-tenant";

import { getRecordRoutineRiskFindingsInteractor } from "@/core/di";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "analyze-routine-loops";

export type AnalyzeRoutineLoopsWorkflowPayload = {
  companyId: string;
  tenant?: WorkflowTenant;
};

async function clearFindings(companyId: string): Promise<void> {
  "use step";
  await getRecordRoutineRiskFindingsInteractor().invoke({
    companyId,
    findings: [],
  });
}

export async function analyzeRoutineLoops(payload: AnalyzeRoutineLoopsWorkflowPayload): Promise<void> {
  "use workflow";
  const { tenant } = payload;

  try {
    await clearFindings(payload.companyId);
  } catch (err) {
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(err), tenant);
    throw err;
  }
}
