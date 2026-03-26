import { multiInject } from "inversify";

import { DomainEvent, DomainEventMap } from "./domain-events";

import { UserAccessor } from "@/core/base/user-accessor";
import { TenantScoped } from "@/core/decorators/tenant-scoped.decorator";
import { BaseTaskListener } from "@/features/tasks/listener/base-task.listener";
import { CreateWebhookDeliveryRepo } from "@/features/webhook/create-webhook-delivery.repo";
import { WebhookEventSchema } from "@/features/webhook/webhook.schema";

export abstract class GetWebhooksForEventRepo {
  abstract getWebhooksForEvent(event: string): Promise<{ url: string; events: string[] }[]>;
}

export abstract class CreateAuditLogRepo {
  abstract log(data: { event: string; eventData: Record<string, unknown>; entityId: string }): Promise<void>;
}

type ScopedEventData<E extends DomainEvent> = Omit<DomainEventMap[E], "userId" | "companyId">;

@TenantScoped
export class EventService extends UserAccessor {
  constructor(
    @multiInject(BaseTaskListener) private readonly taskListeners: BaseTaskListener[],
    private webhookRepo: GetWebhooksForEventRepo,
    private webhookDeliveryRepo: CreateWebhookDeliveryRepo,
    private auditLogRepo: CreateAuditLogRepo,
  ) {
    super();
  }

  async publish<E extends DomainEvent>(event: E, data: ScopedEventData<E>): Promise<void> {
    const { id: userId, companyId } = this.user;

    const eventData = { ...data, userId, companyId } as DomainEventMap[E];

    const tasks = [
      ...this.taskListeners.map((listener) => listener.handle(event, eventData)),
      this.createAuditLog(event, eventData),
      this.createWebhookDeliveries(event, eventData),
    ];

    await Promise.all(tasks);
  }

  private async createAuditLog(event: DomainEvent, payload: DomainEventMap[DomainEvent]) {
    await this.auditLogRepo.log({
      event,
      eventData: payload as Record<string, unknown>,
      entityId: payload.entityId,
    });
  }

  private async createWebhookDeliveries(event: DomainEvent, payload: DomainEventMap[DomainEvent]) {
    if (!(WebhookEventSchema.options as readonly string[]).includes(event)) return;

    const webhooks = await this.webhookRepo.getWebhooksForEvent(event);

    if (webhooks.length === 0) return;

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
  }
}
