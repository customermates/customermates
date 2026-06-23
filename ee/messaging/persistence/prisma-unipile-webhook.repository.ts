import type { Prisma } from "@/generated/prisma";

import { UnipileWebhookSource } from "@/generated/prisma";

import type { RepoArgs } from "@/core/utils/types";
import type { WebhookEventRepo } from "../webhooks/webhook-event.repo";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

export class PrismaUnipileWebhookRepo extends BaseRepository implements WebhookEventRepo {
  @BypassTenantGuard
  async createWebhookEventUnscoped(args: RepoArgs<WebhookEventRepo, "createWebhookEventUnscoped">) {
    const row = await this.prisma.messagingInboundEvent.create({
      data: {
        companyId: args.companyId,
        source: args.source,
        eventType: args.eventType,
        accountId: args.accountId,
        payload: args.payload as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    return row;
  }

  @BypassTenantGuard
  async findWebhookEventByIdOrThrowUnscoped(id: string) {
    return this.prisma.messagingInboundEvent.findUniqueOrThrow({
      where: { id },
      select: { id: true, source: true, payload: true, processed: true },
    });
  }

  @BypassTenantGuard
  async markWebhookEventUnscoped(args: RepoArgs<WebhookEventRepo, "markWebhookEventUnscoped">) {
    await this.prisma.messagingInboundEvent.update({
      where: { id: args.id },
      data: {
        processed: args.processed,
        processedAt: args.processed ? new Date() : null,
      },
    });
  }

  @BypassTenantGuard
  async findReprocessableEventIdsUnscoped(args: RepoArgs<WebhookEventRepo, "findReprocessableEventIdsUnscoped">) {
    const rows = await this.prisma.messagingInboundEvent.findMany({
      where: {
        processed: false,
        source: { in: Object.values(UnipileWebhookSource) },
        receivedAt: {
          lte: args.olderThan,
          gte: new Date(Date.now() - args.maxAgeDays * 86_400_000),
        },
      },
      orderBy: { receivedAt: "asc" },
      take: args.limit,
      select: { id: true },
    });

    return rows.map((row) => row.id);
  }
}
