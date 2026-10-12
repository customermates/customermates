import type { Data } from "@/core/validation/validation.utils";
import type { WebhookDto, WebhookPublicDtoSchema } from "./webhook.schema";

type WebhookPublicDto = Data<typeof WebhookPublicDtoSchema>;

export function toPublicWebhook({ secret, headers, ...webhook }: WebhookDto): WebhookPublicDto {
  return { ...webhook, hasSecret: secret != null && secret !== "", headerNames: Object.keys(headers ?? {}) };
}
