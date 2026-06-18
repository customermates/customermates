import type { ProcessUnipileWebhookEventPayload } from "@/ee/messaging/ingest/process-unipile-webhook-event.interactor";

import { getProcessUnipileWebhookEventInteractor } from "@/core/di";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "process-unipile-webhook-event";

async function processStep(payload: ProcessUnipileWebhookEventPayload): Promise<void> {
  "use step";
  await getProcessUnipileWebhookEventInteractor().invoke(payload);
}
processStep.maxRetries = 0;

export async function processUnipileWebhookEvent(payload: ProcessUnipileWebhookEventPayload): Promise<void> {
  "use workflow";
  try {
    await processStep(payload);
  } catch (err) {
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(err));
    throw err;
  }
}
