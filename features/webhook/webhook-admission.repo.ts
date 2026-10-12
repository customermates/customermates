import type { EventLog, Webhook } from "@/generated/prisma";

export abstract class WebhookAdmissionRepo {
  abstract findEventWebhooksUnscoped(event: Pick<EventLog, "companyId" | "kind">, ids?: string[]): Promise<Webhook[]>;
  abstract admitDeliveryOrThrowUnscoped(args: {
    event: Pick<EventLog, "companyId" | "id" | "kind">;
    webhook: Pick<Webhook, "id" | "url">;
    subscriptionRevision: number | null;
  }): Promise<{ id: string; nextAttemptAt: Date | null }>;
}
