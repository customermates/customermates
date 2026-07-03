import type { WebhookEventRepo } from "../webhooks/webhook-event.repo";
import type { ProcessUnipileWebhookInteractor } from "../webhooks/process-unipile-webhook.interactor";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

const REPROCESS_MIN_AGE_MS = 5 * 60 * 1000;
const REPROCESS_MAX_AGE_DAYS = 30;
const REPROCESS_MAX_ATTEMPTS = 10;
const REPROCESS_BATCH_LIMIT = 500;

@SystemInteractor
export class ReprocessStuckWebhookEventsInteractor {
  constructor(
    private repo: WebhookEventRepo,
    private processor: ProcessUnipileWebhookInteractor,
  ) {}

  async invoke(): Promise<void> {
    const ids = await this.repo.findReprocessableEventIdsUnscoped({
      olderThan: new Date(Date.now() - REPROCESS_MIN_AGE_MS),
      maxAgeDays: REPROCESS_MAX_AGE_DAYS,
      maxAttempts: REPROCESS_MAX_ATTEMPTS,
      limit: REPROCESS_BATCH_LIMIT,
    });

    for (const id of ids) {
      try {
        await this.processor.invoke({ id });
      } catch {
        continue;
      }
    }
  }
}
