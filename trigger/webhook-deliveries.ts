import { AbortTaskRunError, task } from "@trigger.dev/sdk/v3";

import { getDeliverWebhookInteractor } from "./worker-di";
import { type DeliverWebhookPayload } from "@/features/webhook/deliver-webhook.interactor";
import { WebhookExternalFailure } from "@/core/errors/app-errors";

export class WebhookPermanentFailure extends AbortTaskRunError {
  override name = "WebhookPermanentFailure" as const;
  constructor(
    public readonly statusCode: number | null,
    public readonly responseMessage: string | null,
  ) {
    super(`Webhook target responded ${statusCode ?? "no-status"} ${responseMessage ?? ""} (non-retryable)`.trim());
  }
}

const RETRYABLE_4XX = new Set([408, 425, 429]);

function isRetryableStatus(status: number | null): boolean {
  if (status === null) return true;
  if (status >= 500) return true;
  if (RETRYABLE_4XX.has(status)) return true;
  if (status >= 400) return false;
  return true;
}

export const deliverWebhook = task({
  id: "deliver-webhook",
  retry: {
    maxAttempts: 5,
    minTimeoutInMs: 1_000,
    maxTimeoutInMs: 60_000,
    factor: 2,
    randomize: true,
  },
  maxDuration: 30,
  run: async (payload: DeliverWebhookPayload) => {
    const result = await getDeliverWebhookInteractor().invoke(payload);

    if (result.status === "failed") {
      if (isRetryableStatus(result.statusCode))
        throw new WebhookExternalFailure(result.statusCode, result.responseMessage);

      throw new WebhookPermanentFailure(result.statusCode, result.responseMessage);
    }

    return result;
  },
});
