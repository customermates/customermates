import { type MessagingInboundEvent, MessagingInboundEventSource } from "@/generated/prisma";

export const WEBHOOK_INBOUND_SOURCE = MessagingInboundEventSource.webhook;

type InboundEventRow = Pick<MessagingInboundEvent, "id" | "payload" | "processed">;

export abstract class WebhookEventRepo {
  abstract createWebhookEventUnscoped(args: {
    source: MessagingInboundEventSource;
    payload: unknown;
  }): Promise<{ id: string }>;
  abstract findWebhookEventByIdOrThrowUnscoped(id: string): Promise<InboundEventRow>;
  abstract markWebhookEventProcessedUnscoped(id: string): Promise<void>;
  abstract markWebhookEventFailedUnscoped(args: {
    id: string;
    error: string;
    terminal: boolean;
    unipileMessageId?: string | null;
  }): Promise<void>;
  abstract findReprocessableEventIdsUnscoped(args: {
    olderThan: Date;
    maxAgeDays: number;
    maxAttempts: number;
    limit: number;
  }): Promise<string[]>;
}
