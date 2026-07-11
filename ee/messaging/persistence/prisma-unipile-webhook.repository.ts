import type { Prisma } from "@/generated/prisma";

import type { RepoArgs } from "@/core/utils/types";
import type { WebhookEventRepo } from "../webhooks/webhook-event.repo";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { WEBHOOK_INBOUND_SOURCE } from "../webhooks/webhook-event.repo";

export class PrismaUnipileWebhookRepo extends BaseRepository implements WebhookEventRepo {
  @BypassTenantGuard
  async createWebhookEventUnscoped(args: RepoArgs<WebhookEventRepo, "createWebhookEventUnscoped">) {
    const row = await this.prisma.messagingInboundEvent.create({
      data: {
        source: args.source,
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
      select: { id: true, payload: true, processed: true },
    });
  }

  @BypassTenantGuard
  async markWebhookEventProcessedUnscoped(id: string) {
    await this.prisma.messagingInboundEvent.update({
      where: { id },
      data: { processed: true, processedAt: new Date(), error: null, lastErrorAt: null },
    });
  }

  @BypassTenantGuard
  async markWebhookEventFailedUnscoped(args: RepoArgs<WebhookEventRepo, "markWebhookEventFailedUnscoped">) {
    await this.prisma.messagingInboundEvent.update({
      where: { id: args.id },
      data: {
        processed: args.terminal,
        processedAt: args.terminal ? new Date() : null,
        error: args.error,
        lastErrorAt: new Date(),
        attemptCount: { increment: 1 },
        ...(args.unipileMessageId != null ? { unipileMessageId: args.unipileMessageId } : {}),
      },
    });
  }

  @BypassTenantGuard
  async countRecentEmailDeletesUnscoped(args: RepoArgs<WebhookEventRepo, "countRecentEmailDeletesUnscoped">) {
    return this.prisma.messagingInboundEvent.count({
      where: {
        source: WEBHOOK_INBOUND_SOURCE,
        receivedAt: { gte: args.since },
        AND: [
          { payload: { path: ["type"], equals: "email.delete" } },
          { payload: { path: ["account_id"], equals: args.unipileAccountId } },
        ],
      },
    });
  }

  @BypassTenantGuard
  async findReprocessableEventIdsUnscoped(args: RepoArgs<WebhookEventRepo, "findReprocessableEventIdsUnscoped">) {
    const rows = await this.prisma.messagingInboundEvent.findMany({
      where: {
        processed: false,
        source: WEBHOOK_INBOUND_SOURCE,
        attemptCount: { lt: args.maxAttempts },
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
