import { type WebhookDto } from "./webhook.schema";

import { DomainEvent, type DomainEventMap } from "@/features/event/domain-events";
import { TenantScoped } from "@/core/decorators/tenant-scoped.decorator";

export abstract class GetWebhooksForEventRepo {
  abstract getWebhooksForEvent(event: string, companyId: string): Promise<WebhookDto[]>;
}

export abstract class CreateWebhookDeliveryRepo {
  abstract createDelivery(args: {
    url: string;
    companyId: string;
    event: string;
    requestBody: unknown;
    statusCode: number | null;
    responseMessage: string | null;
    success: boolean;
  }): Promise<void>;
}

@TenantScoped
export class WebhookService {
  constructor(
    private webhookRepo: GetWebhooksForEventRepo,
    private deliveryRepo: CreateWebhookDeliveryRepo,
  ) {}

  async handle<E extends DomainEvent>(event: E, payload: DomainEventMap[E]): Promise<void> {
    const webhookEvents = [
      DomainEvent.CONTACT_CREATED,
      DomainEvent.CONTACT_UPDATED,
      DomainEvent.CONTACT_DELETED,
      DomainEvent.ORGANIZATION_CREATED,
      DomainEvent.ORGANIZATION_UPDATED,
      DomainEvent.ORGANIZATION_DELETED,
      DomainEvent.DEAL_CREATED,
      DomainEvent.DEAL_UPDATED,
      DomainEvent.DEAL_DELETED,
      DomainEvent.SERVICE_CREATED,
      DomainEvent.SERVICE_UPDATED,
      DomainEvent.SERVICE_DELETED,
      DomainEvent.TASK_CREATED,
      DomainEvent.TASK_UPDATED,
      DomainEvent.TASK_DELETED,
    ] as Array<DomainEvent>;

    if (webhookEvents.includes(event)) await this.deliverEvent(event, payload);
  }

  private async deliverEvent<E extends DomainEvent>(event: E, payload: DomainEventMap[E]) {
    const { companyId } = payload;
    const webhooks = await this.webhookRepo.getWebhooksForEvent(event, companyId);

    await Promise.all(
      webhooks
        .filter((webhook) => webhook.enabled)
        .map((webhook) =>
          this.deliverWebhookEvent({
            url: webhook.url,
            companyId,
            event,
            requestBody: {
              event,
              data: payload,
              timestamp: new Date().toISOString(),
            },
            secret: webhook.secret ?? null,
          }),
        ),
    );
  }

  async deliverWebhookEvent(args: {
    url: string;
    companyId: string;
    event: string;
    requestBody: unknown;
    secret: string | null;
  }): Promise<void> {
    const body = JSON.stringify(args.requestBody);

    let statusCode: number | null = null;
    let responseMessage: string | null = null;
    let success = false;

    try {
      const signature = args.secret ? await this.generateSignature(args.secret, body) : null;

      const response = await fetch(args.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(signature && { "X-Webhook-Signature": signature }),
        },
        body,
      });

      success = response.ok;
      statusCode = response.status;
      responseMessage = response.statusText;
    } catch (error) {
      responseMessage = error instanceof Error ? error.message : "Network error";
    }

    await this.deliveryRepo.createDelivery({
      url: args.url,
      companyId: args.companyId,
      event: args.event,
      requestBody: args.requestBody,
      statusCode,
      responseMessage,
      success,
    });
  }

  private async generateSignature(secret: string, payload: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
    ]);
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    return Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
}
