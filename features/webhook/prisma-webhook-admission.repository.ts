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
}
