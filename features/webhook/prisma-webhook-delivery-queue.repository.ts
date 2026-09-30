import { randomUUID } from "node:crypto";
import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import type { WebhookDeliveryQueueRepo, WebhookDeliveryClaim } from "./webhook-delivery-queue.repo";

const LEASE_MS = 60_000;

export class PrismaWebhookDeliveryQueueRepo extends BaseRepository implements WebhookDeliveryQueueRepo {
  @BypassTenantGuard
  claimUnscoped(companyId: string, deliveryId: string, now: Date): Promise<WebhookDeliveryClaim> {
    return runInTransaction(
      async () => {
        const row = await this.prisma.webhookDelivery.findFirst({ where: { companyId, id: deliveryId } });
        if (!row) return { status: "missing" };
        if (row.status === "success" || !row.nextAttemptAt) return { status: "complete", success: row.success };
        if (row.leaseExpiresAt && row.leaseExpiresAt > now)
          return { status: "deferred", nextAttemptAt: row.leaseExpiresAt };
        if (row.nextAttemptAt > now) return { status: "deferred", nextAttemptAt: row.nextAttemptAt };
        const token = randomUUID();
        await this.prisma.webhookDelivery.update({
          where: { companyId, id: deliveryId },
          data: {
            status: "processing",
            leaseToken: token,
            leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
            attempts: { increment: 1 },
          },
        });
        return { status: "claimed", token, attempts: row.attempts + 1 };
      },
      { companyId },
    );
  }

  @BypassTenantGuard
  async contextUnscoped(companyId: string, deliveryId: string, token: string) {
    const delivery = await this.prisma.webhookDelivery.findFirst({
      where: { companyId, id: deliveryId, leaseToken: token, status: "processing", leaseExpiresAt: { gt: new Date() } },
    });
    if (!delivery) return null;
    const candidates =
      delivery.recordEventId && !delivery.webhookId
        ? []
        : await this.prisma.webhook.findMany({
            where: { companyId, ...(delivery.webhookId ? { id: delivery.webhookId } : { url: delivery.url }) },
            take: 2,
          });
    const webhook = candidates.length === 1 ? candidates[0] : null;
    const subscription =
      delivery.recordEventId && webhook
        ? await this.prisma.recordEventSubscription.findFirst({
            where: { companyId, id: webhook.id, kind: "webhook" },
          })
        : null;
    return { delivery, webhook, subscription };
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
