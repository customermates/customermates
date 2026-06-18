import { backfillConnectedAccount } from "./backfill-connected-account";
import { deliverWebhook } from "./deliver-webhook";
import { processUnipileWebhookEvent } from "./process-unipile-webhook-event";
import { triggerTestError } from "./trigger-test-error";

export const WORKFLOW_REGISTRY = {
  "process-unipile-webhook-event": processUnipileWebhookEvent,
  "backfill-connected-account": backfillConnectedAccount,
  "deliver-webhook": deliverWebhook,
  "trigger-test-error": triggerTestError,
} as const;

export type WorkflowId = keyof typeof WORKFLOW_REGISTRY;

export type WorkflowPayload<TId extends WorkflowId> = Parameters<(typeof WORKFLOW_REGISTRY)[TId]>[0];
