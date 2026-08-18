import type { DeliverWebhookPayload } from "@/features/webhook/deliver-webhook.interactor";
import type { WorkflowTenant } from "./workflow-tenant";

import { getDeliverWebhookInteractor } from "@/core/di";
import { isExpectedError, WebhookExternalFailure, WebhookNonRetryableFailure } from "@/core/errors/app-errors";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "deliver-webhook";
const RETRYABLE_4XX = new Set([408, 425, 429]);

export type DeliverWebhookWorkflowPayload = DeliverWebhookPayload & { tenant?: WorkflowTenant };

async function deliverStep(payload: DeliverWebhookPayload): Promise<void> {
  "use step";
  const data = await getDeliverWebhookInteractor().invoke(payload);

  if (data.status === "failed") {
    const code = data.statusCode;
    const nonRetryable = code !== null && code >= 400 && code < 500 && !RETRYABLE_4XX.has(code);

    if (nonRetryable) throw new WebhookNonRetryableFailure(code, data.responseMessage);

    throw new WebhookExternalFailure(code, data.responseMessage);
  }
}
deliverStep.maxRetries = 5;

export async function deliverWebhook(payload: DeliverWebhookWorkflowPayload): Promise<void> {
  "use workflow";
  const { tenant, ...delivery } = payload;

  try {
    await deliverStep(delivery);
  } catch (err) {
    if (isExpectedError(err)) return;
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(err), tenant);
    throw err;
  }
}
