import type { WorkflowTenant } from "./workflow-tenant";

import { getFailRoutineRunInteractor, getStartRoutineRunInteractor } from "@/core/di";
import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";

import { AppErrorCode, appErrorDetailsInCauseChain, isExpectedError } from "@/core/errors/app-errors";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "run-routine";

export type RunRoutineWorkflowPayload = {
  routineRunId: string;
  companyId: string;
  ownerUserId: string;
  tenant?: WorkflowTenant;
};

function startFailureReason(error: unknown): string {
  return appErrorDetailsInCauseChain(error)?.code === AppErrorCode.inactiveUser ? "ownerInactive" : "startFailed";
}

async function startRoutineRunStep(payload: RunRoutineWorkflowPayload): Promise<void> {
  "use step";
  try {
    await runAsBackgroundTenant(payload.ownerUserId, () =>
      getStartRoutineRunInteractor().invoke({ routineRunId: payload.routineRunId }),
    );
  } catch (error) {
    await getFailRoutineRunInteractor().invoke({
      routineRunId: payload.routineRunId,
      expectedExecutorUserId: payload.ownerUserId,
      reason: startFailureReason(error),
    });

    if (!isExpectedError(error)) throw error;
  }
}
startRoutineRunStep.maxRetries = 0;

export async function runRoutine(payload: RunRoutineWorkflowPayload): Promise<void> {
  "use workflow";
  const { tenant } = payload;

  try {
    await startRoutineRunStep(payload);
  } catch (err) {
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(err), tenant);
    throw err;
  }
}
