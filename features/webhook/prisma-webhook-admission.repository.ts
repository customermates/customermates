import type { EventLog, Webhook } from "@/generated/prisma";
import type { WebhookAdmissionRepo } from "./webhook-admission.repo";

import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

export class PrismaWebhookAdmissionRepo extends TenantRepository implements WebhookAdmissionRepo {
  @BypassTenantGuard
  findEventWebhooksUnscoped(event: Pick<EventLog, "companyId" | "kind">, ids?: string[]): Promise<Webhook[]> {
    return this.prisma.webhook.findMany({
      where: {
        companyId: event.companyId,
        ...(ids ? { id: { in: ids } } : {}),
        enabled: true,
        events: { has: event.kind },
      },
    });
  }

  @BypassTenantGuard
  async admitDeliveryOrThrowUnscoped(args: {
    event: Pick<EventLog, "companyId" | "id" | "kind">;
    webhook: Pick<Webhook, "id" | "url">;
    subscriptionRevision: number | null;
  }): Promise<{ id: string; nextAttemptAt: Date | null }> {
    const { event, webhook, subscriptionRevision } = args;
    const admissionKey = `${webhook.id}:${event.id}`;
    await this.prisma.webhookDelivery.createMany({
      data: [
        {
          companyId: event.companyId,
          webhookId: webhook.id,
          eventId: event.id,
          admissionKey,
          subscriptionRevision,
          url: webhook.url,
          event: event.kind,
          requestBody: { eventId: event.id },
        },
      ],
      skipDuplicates: true,
    });
    return this.prisma.webhookDelivery.findFirstOrThrow({
      where: { companyId: event.companyId, admissionKey },
      select: { id: true, nextAttemptAt: true },
    });
  }
}
