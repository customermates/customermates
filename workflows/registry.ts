import { runAgentTurn } from "./agent-turn";
import { analyzeRoutineLoops } from "./analyze-routine-loops";
import { backfillConnectedAccount } from "./backfill-connected-account";
import { deliverWebhook } from "./deliver-webhook";
import { reconcileRoutineRuns } from "./reconcile-routine-runs";
import { runRoutine } from "./run-routine";
import { triggerTestError } from "./trigger-test-error";

export const WORKFLOW_REGISTRY = {
  "agent-turn": runAgentTurn,
  "analyze-routine-loops": analyzeRoutineLoops,
  "backfill-connected-account": backfillConnectedAccount,
  "deliver-webhook": deliverWebhook,
  "reconcile-routine-runs": reconcileRoutineRuns,
  "run-routine": runRoutine,
  "trigger-test-error": triggerTestError,
} as const;

export type WorkflowId = keyof typeof WORKFLOW_REGISTRY;

export type WorkflowPayload<TId extends WorkflowId> = Parameters<(typeof WORKFLOW_REGISTRY)[TId]>[0];
