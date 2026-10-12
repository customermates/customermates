import type { EventLog, Webhook } from "@/generated/prisma";

export abstract class WebhookDeliveryAdmissionRepo {
  abstract admitDeliveryOrThrowUnscoped(args: {
    event: Pick<EventLog, "companyId" | "id" | "kind">;
    webhook: Pick<Webhook, "id" | "url">;
    subscriptionRevision: number | null;
  }): Promise<{ id: string; nextAttemptAt: Date | null }>;
}
