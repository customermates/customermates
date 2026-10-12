import { randomUUID } from "node:crypto";
import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import type { WebhookDeliveryQueueRepo, WebhookDeliveryClaim } from "./webhook-delivery-queue.repo";

const LEASE_MS = 60_000;

export class PrismaWebhookDeliveryQueueRepo extends TenantRepository implements WebhookDeliveryQueueRepo {
  @BypassTenantGuard
  async claimUnscoped(companyId: string, deliveryId: string, now: Date): Promise<WebhookDeliveryClaim> {
    const row = await this.prisma.webhookDelivery.findFirst({ where: { companyId, id: deliveryId } });
    if (!row) return { status: "missing" };
    if (row.status === "success" || !row.nextAttemptAt) return { status: "complete", success: row.success };
    if (row.leaseExpiresAt && row.leaseExpiresAt > now)
      return { status: "deferred", nextAttemptAt: row.leaseExpiresAt };
    if (row.nextAttemptAt > now) return { status: "deferred", nextAttemptAt: row.nextAttemptAt };
    const token = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);
    const claimed = await this.prisma.webhookDelivery.updateMany({
      where: {
        companyId,
        id: deliveryId,
        attempts: row.attempts,
        status: { not: "success" },
        nextAttemptAt: { lte: now },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
      },
      data: { status: "processing", leaseToken: token, leaseExpiresAt, attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) return { status: "deferred", nextAttemptAt: leaseExpiresAt };
    return { status: "claimed", token, attempts: row.attempts + 1 };
  }

  @BypassTenantGuard
  async contextUnscoped(companyId: string, deliveryId: string, token: string) {
    const delivery = await this.prisma.webhookDelivery.findFirst({
      where: { companyId, id: deliveryId, leaseToken: token, status: "processing", leaseExpiresAt: { gt: new Date() } },
    });
    if (!delivery) return null;
    const [webhook, event] = await Promise.all([
      delivery.webhookId ? this.prisma.webhook.findFirst({ where: { companyId, id: delivery.webhookId } }) : null,
      delivery.eventId ? this.prisma.eventLog.findFirst({ where: { companyId, id: delivery.eventId } }) : null,
    ]);
    const subscription =
      event?.subjectKind === "record" && webhook
        ? await this.prisma.recordEventSubscription.findFirst({
            where: { companyId, id: webhook.id, kind: "webhook" },
          })
        : null;
    return { delivery, webhook, event, subscription };
  }

  @BypassTenantGuard
  async finishUnscoped(input: Parameters<WebhookDeliveryQueueRepo["finishUnscoped"]>[0]) {
    const { companyId, deliveryId, token, success, ...result } = input;
    const updated = await this.prisma.webhookDelivery.updateMany({
      where: { companyId, id: deliveryId, leaseToken: token, status: "processing" },
      data: {
        ...result,
        success,
        status: success ? "success" : "failed",
        deliveredAt: success ? new Date() : null,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
    return updated.count === 1;
  }

  @BypassTenantGuard
  async dueUnscoped(now: Date, take: number) {
    const rows = await this.prisma.webhookDelivery.findMany({
      where: {
        nextAttemptAt: { lte: now },
        status: { not: "success" },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
      },
      select: { companyId: true, id: true },
      orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
      take,
    });
    return rows.map(({ companyId, id }) => ({ companyId, deliveryId: id }));
  }
}
