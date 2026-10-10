import type { EventService } from "@/features/event/event.service";
import type { UpsertWebhookRepo } from "./upsert-webhook.repo";

import { DomainEvent } from "@/features/event/domain-events";
import { calculateWebhookChanges, toWebhookEventPayload } from "./webhook-event-payload";

export class WebhookPauseNotifier {
  constructor(
    private webhooks: Pick<UpsertWebhookRepo, "getWebhookByIdOrThrow">,
    private events: Pick<EventService, "publish">,
  ) {}

  async notify(ids: string[]) {
    for (const id of ids) {
      const webhook = await this.webhooks.getWebhookByIdOrThrow(id);
      await this.events.publish(DomainEvent.WEBHOOK_UPDATED, {
        entityId: id,
        payload: {
          webhook: toWebhookEventPayload(webhook),
          changes: calculateWebhookChanges({ ...webhook, enabled: true, pausedReason: null }, webhook),
        },
      });
    }
  }
}
