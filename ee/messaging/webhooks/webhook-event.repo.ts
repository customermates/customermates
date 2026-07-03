import { type MessagingInboundEvent, MessagingInboundEventSource } from "@/generated/prisma";

export const WEBHOOK_INBOUND_SOURCE = MessagingInboundEventSource.webhook;

type InboundEventRow = Pick<MessagingInboundEvent, "id" | "source" | "payload" | "processed">;

export abstract class WebhookEventRepo {
  abstract createWebhookEventUnscoped(args: {
    companyId: string | null;
    source: MessagingInboundEventSource;
    eventType: string | null;
    accountId: string | null;
    payload: unknown;
  }): Promise<{ id: string }>;
  abstract findWebhookEventByIdOrThrowUnscoped(id: string): Promise<InboundEventRow>;
  abstract markWebhookEventUnscoped(args: {
    id: string;
    processed: boolean;
    error?: string | null;
    lastErrorAt?: Date | null;
  }): Promise<void>;
  abstract findReprocessableEventIdsUnscoped(args: {
    olderThan: Date;
    maxAgeDays: number;
    maxAttempts: number;
    limit: number;
  }): Promise<string[]>;
}
