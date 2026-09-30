import type { DeliverWebhookPayload } from "@/features/webhook/deliver-webhook.interactor";
import type { WorkflowTenant } from "./workflow-tenant";
import { sleep } from "workflow";
import { getDeliverWebhookInteractor } from "@/core/di";
import { reportFailure, toWorkflowFailure } from "./capture-failure";

export type DeliverWebhookWorkflowPayload = DeliverWebhookPayload & { tenant?: WorkflowTenant };

async function deliverStep(payload: DeliverWebhookPayload) {
  "use step";
  return getDeliverWebhookInteractor().invoke(payload);
}
deliverStep.maxRetries = 3;

export async function deliverWebhook(payload: DeliverWebhookWorkflowPayload): Promise<void> {
  "use workflow";
  const { tenant, ...delivery } = payload;
  try {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const result = await deliverStep(delivery);
      if (!result.nextAttemptAt) return;
      await sleep(new Date(result.nextAttemptAt));
    }
  } catch (error) {
    await reportFailure("deliver-webhook", toWorkflowFailure(error), tenant);
    throw error;
  }
}
