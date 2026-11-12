import type {
  IncomingWebhookCreate,
  IncomingWebhookPatch,
  IncomingWebhookRepo,
  NewIncomingDelivery,
  StoredIncomingDelivery,
  StoredIncomingWebhook,
} from "./incoming-webhook.repo";
import type { IncomingWebhookLookup, IncomingWebhookLookupRepo } from "./incoming-webhook-lookup.repo";

import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { Prisma } from "@/generated/prisma";

const WEBHOOK_SELECT = {
  id: true,
  typeId: true,
  name: true,
  createdById: true,
  enabled: true,
  tokenVersion: true,
  signingSecret: true,
  signatureHeader: true,
  mapping: true,
  samplePayload: true,
  lastReceivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function jsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

export class PrismaIncomingWebhookRepo
  extends TenantRepository
  implements IncomingWebhookRepo, IncomingWebhookLookupRepo
{
  findWebhook(id: string): Promise<StoredIncomingWebhook | null> {
    return this.prisma.incomingWebhook.findFirst({ where: { id, companyId: this.companyId }, select: WEBHOOK_SELECT });
  }

  listWebhooks(typeId?: string): Promise<StoredIncomingWebhook[]> {
    return this.prisma.incomingWebhook.findMany({
      where: { companyId: this.companyId, ...(typeId ? { typeId } : {}) },
      select: WEBHOOK_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  createWebhook(data: IncomingWebhookCreate): Promise<StoredIncomingWebhook> {
    return this.prisma.incomingWebhook.create({
      data: {
        companyId: this.companyId,
        createdById: this.userId,
        typeId: data.typeId,
        name: data.name,
        enabled: data.enabled,
        signingSecret: data.signingSecret,
        signatureHeader: data.signatureHeader,
        mapping: data.mapping,
        samplePayload: jsonValue(data.samplePayload),
      },
      select: WEBHOOK_SELECT,
    });
  }

  updateWebhook(id: string, patch: IncomingWebhookPatch): Promise<StoredIncomingWebhook> {
    return this.prisma.incomingWebhook.update({
      where: { id, companyId: this.companyId },
      data: {
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
        ...(patch.signingSecret === undefined ? {} : { signingSecret: patch.signingSecret }),
        ...(patch.signatureHeader === undefined ? {} : { signatureHeader: patch.signatureHeader }),
        ...(patch.mapping === undefined ? {} : { mapping: patch.mapping }),
        ...(patch.samplePayload === undefined ? {} : { samplePayload: jsonValue(patch.samplePayload) }),
        ...(patch.rotateToken ? { tokenVersion: { increment: 1 } } : {}),
      },
      select: WEBHOOK_SELECT,
    });
  }

  async deleteWebhook(id: string): Promise<boolean> {
    const { count } = await this.prisma.incomingWebhook.deleteMany({ where: { id, companyId: this.companyId } });
    return count > 0;
  }

  listDeliveries(webhookId: string, limit: number): Promise<StoredIncomingDelivery[]> {
    return this.prisma.incomingWebhookDelivery.findMany({
      where: { webhookId, companyId: this.companyId },
      select: {
        id: true,
        outcome: true,
        statusCode: true,
        message: true,
        recordId: true,
        payloadBytes: true,
        payload: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });
  }

  @Transaction
  async recordDelivery(delivery: NewIncomingDelivery, retentionDays: number): Promise<{ id: string }> {
    const created = await this.prisma.incomingWebhookDelivery.create({
      data: {
        companyId: this.companyId,
        webhookId: delivery.webhookId,
        outcome: delivery.outcome,
        statusCode: delivery.statusCode,
        message: delivery.message,
        recordId: delivery.recordId,
        payloadBytes: delivery.payloadBytes,
        payload: jsonValue(delivery.payload),
      },
      select: { id: true },
    });
    await this.prisma.incomingWebhookDelivery.deleteMany({
      where: {
        webhookId: delivery.webhookId,
        companyId: this.companyId,
        createdAt: { lt: new Date(Date.now() - retentionDays * DAY_MS) },
      },
    });
    if (delivery.outcome === "created" || delivery.outcome === "updated")
      await this.prisma.incomingWebhook.update({
        where: { id: delivery.webhookId, companyId: this.companyId },
        data: { lastReceivedAt: new Date() },
      });
    return created;
  }

  @BypassTenantGuard
  findWebhookUnscoped(id: string): Promise<IncomingWebhookLookup | null> {
    return this.prisma.incomingWebhook.findUnique({
      where: { id },
      select: { ...WEBHOOK_SELECT, companyId: true, company: { select: { deletingAt: true } } },
    });
  }
}
