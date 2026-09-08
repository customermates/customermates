import { type MessagingInboundEvent, MessagingInboundEventSource } from "@/generated/prisma";

export const WEBHOOK_INBOUND_SOURCE = MessagingInboundEventSource.webhook;
export const WEBHOOK_REPROCESS_MAX_ATTEMPTS = 10;

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
  }): Promise<Pick<MessagingInboundEvent, "attemptCount">>;
  abstract findReprocessableEventIdsUnscoped(args: {
    olderThan: Date;
    maxAgeDays: number;
    maxAttempts: number;
    limit: number;
  }): Promise<string[]>;
  abstract countRecentEmailDeletesUnscoped(args: { unipileAccountId: string; since: Date }): Promise<number>;
}
