import type { ProcessUnipileWebhookInteractor } from "./process-unipile-webhook.interactor";
import type { WebhookEventRepo } from "./webhook-event.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import { WEBHOOK_INBOUND_SOURCE } from "./webhook-event.repo";

@SystemInteractor
export class IngestUnipileWebhookInteractor {
  constructor(
    private events: WebhookEventRepo,
    private process: ProcessUnipileWebhookInteractor,
  ) {}

  async invoke(body: unknown): Promise<void> {
    const { id } = await this.events.createWebhookEventUnscoped({ source: WEBHOOK_INBOUND_SOURCE, payload: body });

    await this.process.invoke({ id });
  }
}
