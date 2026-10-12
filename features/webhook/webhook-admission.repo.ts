import type { EventLog, Webhook } from "@/generated/prisma";

export abstract class WebhookAdmissionRepo {
  abstract findEventWebhooksUnscoped(event: Pick<EventLog, "companyId" | "kind">, ids?: string[]): Promise<Webhook[]>;
}
