import type { MessagingInboundEvent } from "@/generated/prisma";

type InboundEventRow = Pick<MessagingInboundEvent, "id" | "source" | "payload" | "processed">;

export abstract class WebhookEventRepo {
  abstract createWebhookEventUnscoped(args: {
    companyId: string | null;
    source: string;
    eventType: string | null;
    accountId: string | null;
    payload: unknown;
  }): Promise<{ id: string }>;
  abstract findWebhookEventByIdOrThrowUnscoped(id: string): Promise<InboundEventRow>;
  abstract markWebhookEventUnscoped(args: { id: string; processed: boolean }): Promise<void>;
}
