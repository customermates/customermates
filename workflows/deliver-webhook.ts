import type { DeliverWebhookPayload } from "@/features/webhook/deliver-webhook.interactor";
import type { WorkflowTenant } from "./workflow-tenant";
import { getStepMetadata, RetryableError } from "workflow";
import { getDeliverWebhookInteractor } from "@/core/di";
import { reportFailure, toWorkflowFailure } from "./capture-failure";

export type DeliverWebhookWorkflowPayload = DeliverWebhookPayload & { tenant?: WorkflowTenant };

async function deliverStep(payload: DeliverWebhookPayload) {
  "use step";
  const result = await getDeliverWebhookInteractor().invoke(payload);
  if (result.nextAttemptAt && getStepMetadata().attempt <= deliverStep.maxRetries)
    throw new RetryableError("Webhook delivery retry is scheduled", { retryAfter: new Date(result.nextAttemptAt) });
  return result;
}
deliverStep.maxRetries = 16;

export async function deliverWebhook(payload: DeliverWebhookWorkflowPayload): Promise<void> {
  "use workflow";
  const { tenant, ...delivery } = payload;
  try {
    await deliverStep(delivery);
  } catch (error) {
    await reportFailure("deliver-webhook", toWorkflowFailure(error), tenant);
    throw error;
  }
}
