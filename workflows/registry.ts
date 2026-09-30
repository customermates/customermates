import { runAgentTurn } from "./agent-turn";
import { backfillConnectedAccount } from "./backfill-connected-account";
import { deliverWebhook } from "./deliver-webhook";
import { reconcileRoutineRuns } from "./reconcile-routine-runs";
import { runRoutine } from "./run-routine";
import { recordOperation } from "./record-operation";
import { processRecordEvents } from "./process-record-events";
import { triggerTestError } from "./trigger-test-error";

export const WORKFLOW_REGISTRY = {
  "agent-turn": runAgentTurn,
  "backfill-connected-account": backfillConnectedAccount,
  "deliver-webhook": deliverWebhook,
  "reconcile-routine-runs": reconcileRoutineRuns,
  "run-routine": runRoutine,
  "record-operation": recordOperation,
  "process-record-events": processRecordEvents,
  "trigger-test-error": triggerTestError,
} as const;

export type WorkflowId = keyof typeof WORKFLOW_REGISTRY;

export type WorkflowPayload<TId extends WorkflowId> = Parameters<(typeof WORKFLOW_REGISTRY)[TId]>[0];
