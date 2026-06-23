import type { WebhookEventRepo } from "../webhooks/webhook-event.repo";
import type { ProcessUnipileWebhookEventInteractor } from "./process-unipile-webhook-event.interactor";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

const REPROCESS_MIN_AGE_MS = 5 * 60 * 1000;
const REPROCESS_MAX_AGE_DAYS = 30;
const REPROCESS_BATCH_LIMIT = 500;

@SystemInteractor
export class ReprocessStuckWebhookEventsInteractor {
  constructor(
    private repo: WebhookEventRepo,
    private processor: ProcessUnipileWebhookEventInteractor,
  ) {}

  async invoke(): Promise<void> {
    const ids = await this.repo.findReprocessableEventIdsUnscoped({
      olderThan: new Date(Date.now() - REPROCESS_MIN_AGE_MS),
      maxAgeDays: REPROCESS_MAX_AGE_DAYS,
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
