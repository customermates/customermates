import type { WebhookDto } from "./webhook.schema";
import type { UpsertWebhookData } from "./upsert-webhook.interactor";

export abstract class UpsertWebhookRepo {
  abstract upsertWebhookOrThrow(args: UpsertWebhookData): Promise<WebhookDto>;
  abstract getWebhookByIdOrThrow(id: string): Promise<WebhookDto>;
  abstract getWebhookById(id: string): Promise<WebhookDto | null>;
}
