import type { DomainEvent, DomainEventMap } from "./domain-events";
import type { BaseTaskListener } from "@/features/tasks/listener/base-task.listener";
import type { CreateWebhookDeliveryRepo } from "@/features/webhook/create-webhook-delivery.repo";
import type { ChangeRecord } from "@/core/utils/calculate-changes";

import { UserAccessor } from "@/core/base/user-accessor";
import { WebhookEventSchema } from "@/features/webhook/webhook.schema";
import { IS_DEVELOPMENT } from "@/constants/env";

export abstract class GetWebhooksForEventRepo {
  abstract getWebhooksForEvent(event: string): Promise<{ url: string; events: string[] }[]>;
}

export abstract class CreateAuditLogRepo {
  abstract log(data: { event: string; eventData: Record<string, unknown>; entityId: string }): Promise<void>;
}

type ScopedEventData<E extends DomainEvent> = Omit<DomainEventMap[E], "userId" | "companyId">;

export type PublishResult = {
  event: DomainEvent;
  skipped: "no-op-update" | null;
  listenerHandlers: number;
  webhookDeliveries: number;
};

function isNoOpUpdate(data: { payload: unknown }): boolean {
  const { payload } = data;
  if (typeof payload !== "object" || payload === null || !("changes" in payload)) return false;
  const { changes } = payload as { changes: ChangeRecord };
  return Object.keys(changes).length === 0;
}

export class EventService extends UserAccessor {
  constructor(
    private readonly taskListeners: BaseTaskListener[],
    private webhookRepo: GetWebhooksForEventRepo,
    private webhookDeliveryRepo: CreateWebhookDeliveryRepo,
    private auditLogRepo: CreateAuditLogRepo,
  ) {
    super();
  }

  async publish<E extends DomainEvent>(event: E, data: ScopedEventData<E>): Promise<PublishResult> {
    if (isNoOpUpdate(data))
      return this.logAndReturn({ event, skipped: "no-op-update", listenerHandlers: 0, webhookDeliveries: 0 });

    const { id: userId, companyId } = this.user;

    const eventData = { ...data, userId, companyId } as DomainEventMap[E];

    const matchingListeners = this.taskListeners.filter((l) => l.handles(event));

    const [, , webhookDeliveries] = await Promise.all([
      Promise.all(matchingListeners.map((listener) => listener.handle(event, eventData))),
      this.createAuditLog(event, eventData),
      this.createWebhookDeliveries(event, eventData),
    ]);

    return this.logAndReturn({
      event,
      skipped: null,
      listenerHandlers: matchingListeners.length,
      webhookDeliveries,
    });
  }

  private logAndReturn(result: PublishResult): PublishResult {
    if (IS_DEVELOPMENT) {
      const { event, skipped, listenerHandlers, webhookDeliveries } = result;
      const suffix = skipped ? ` skipped=${skipped}` : ` listeners=${listenerHandlers} webhooks=${webhookDeliveries}`;
      // eslint-disable-next-line no-console
      console.log(`[event] ${event}${suffix}`);
    }
    return result;
  }

  private async createAuditLog(event: DomainEvent, payload: DomainEventMap[DomainEvent]) {
    await this.auditLogRepo.log({
      event,
      eventData: payload as Record<string, unknown>,
      entityId: payload.entityId,
    });
  }

  private async createWebhookDeliveries(event: DomainEvent, payload: DomainEventMap[DomainEvent]): Promise<number> {
    if (!(WebhookEventSchema.options as readonly string[]).includes(event)) return 0;

    const webhooks = await this.webhookRepo.getWebhooksForEvent(event);

    if (webhooks.length === 0) return 0;

    const body = {
      event,
      data: payload,
      timestamp: new Date().toISOString(),
    };

    const data = webhooks.map((webhook) => ({
      url: webhook.url,
      event,
      requestBody: body as Record<string, unknown>,
    }));

    await this.webhookDeliveryRepo.create(data);
    return webhooks.length;
  }
}
