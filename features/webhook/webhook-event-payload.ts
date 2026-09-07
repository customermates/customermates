import type { WebhookDto } from "./webhook.schema";

export type WebhookEventPayload = Omit<WebhookDto, "secret" | "headers"> & {
  hasSecret: boolean;
  headerNames: string[];
};

export function toWebhookEventPayload(webhook: WebhookDto): WebhookEventPayload {
  const { secret, headers, ...rest } = webhook;

  return {
    ...rest,
    hasSecret: secret != null && secret !== "",
    headerNames: Object.keys(headers ?? {}),
  };
}
