import type { StoredIncomingDelivery, StoredIncomingWebhook } from "./incoming-webhook.repo";
import type {
  IncomingWebhookDeliveryDto,
  IncomingWebhookDto,
  IncomingWebhookMapping,
  IncomingWebhookOutcome,
} from "./incoming-webhook.schema";

import { INCOMING_WEBHOOK_OUTCOMES, IncomingWebhookMappingSchema } from "./incoming-webhook.schema";
import { incomingWebhookUrl } from "./incoming-webhook-token";

export type IncomingWebhookSettings = { baseUrl: string; authSecret: string | undefined };

export function parseIncomingMapping(value: unknown): IncomingWebhookMapping | null {
  const parsed = IncomingWebhookMappingSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function toIncomingWebhookDto(
  webhook: StoredIncomingWebhook,
  settings: IncomingWebhookSettings,
): IncomingWebhookDto | null {
  const mapping = parseIncomingMapping(webhook.mapping);
  if (!mapping) return null;
  return {
    id: webhook.id,
    typeId: webhook.typeId,
    name: webhook.name,
    enabled: webhook.enabled,
    url: incomingWebhookUrl(settings.baseUrl, webhook.id, webhook.tokenVersion, settings.authSecret),
    hasSigningSecret: webhook.signingSecret !== null && webhook.signingSecret !== "",
    signatureHeader: webhook.signatureHeader,
    mapping,
    samplePayload: (webhook.samplePayload ?? null) as IncomingWebhookDto["samplePayload"],
    lastReceivedAt: webhook.lastReceivedAt?.toISOString() ?? null,
    createdAt: webhook.createdAt.toISOString(),
    updatedAt: webhook.updatedAt.toISOString(),
  };
}

function knownOutcome(value: string): IncomingWebhookOutcome {
  return (INCOMING_WEBHOOK_OUTCOMES as readonly string[]).includes(value) ? (value as IncomingWebhookOutcome) : "failed";
}

export function toIncomingDeliveryDto(delivery: StoredIncomingDelivery): IncomingWebhookDeliveryDto {
  return {
    id: delivery.id,
    outcome: knownOutcome(delivery.outcome),
    statusCode: delivery.statusCode,
    message: delivery.message,
    recordId: delivery.recordId,
    payloadBytes: delivery.payloadBytes,
    payload: (delivery.payload ?? null) as IncomingWebhookDeliveryDto["payload"],
    createdAt: delivery.createdAt.toISOString(),
  };
}
