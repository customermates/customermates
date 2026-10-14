import type { WebhookDto } from "./webhook.schema";

export abstract class GetWebhookByIdRepo {
  abstract getWebhookById(id: string): Promise<WebhookDto | null>;
}
