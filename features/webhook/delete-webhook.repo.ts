import type { WebhookDto } from "./webhook.schema";

export abstract class DeleteWebhookRepo {
  abstract deleteWebhookOrThrow(id: string): Promise<WebhookDto>;
}
