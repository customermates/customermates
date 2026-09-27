import type { ChangeRecord } from "@/core/utils/calculate-changes";

import { calculateChanges } from "@/core/utils/calculate-changes";

import { WEBHOOK_MASKED_VALUE, type WebhookDto } from "./webhook.schema";

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

function maskedHeaders(names: string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, WEBHOOK_MASKED_VALUE]));
}

export function calculateWebhookChanges(previous: WebhookDto, next: WebhookDto): ChangeRecord {
  const changes = calculateChanges(toWebhookEventPayload(previous), toWebhookEventPayload(next));

  if (previous.secret && next.secret && previous.secret !== next.secret)
    changes.secret = { previous: WEBHOOK_MASKED_VALUE, current: WEBHOOK_MASKED_VALUE };

  const previousHeaders = previous.headers ?? {};
  const nextHeaders = next.headers ?? {};
  const rewrittenHeaderNames = Object.keys(nextHeaders).filter(
    (name) => Object.hasOwn(previousHeaders, name) && previousHeaders[name] !== nextHeaders[name],
  );
  if (rewrittenHeaderNames.length > 0) {
    changes.headers = {
      previous: maskedHeaders(rewrittenHeaderNames),
      current: maskedHeaders(rewrittenHeaderNames),
    };
  }

  return changes;
}
