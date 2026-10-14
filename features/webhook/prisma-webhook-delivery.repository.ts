import { randomUUID } from "node:crypto";
import type { GetWebhookDeliveriesRepo } from "@/features/webhook/get-webhook-deliveries.repo";
import type { GetWebhookDeliveryByIdRepo } from "./get-webhook-delivery-by-id.repo";
import type { FindWebhookDeliveriesByIdsRepo } from "./find-webhook-deliveries-by-ids.repo";
import type { RecordRecipientReader } from "@/features/records/record-recipient-reader";
import type { WebhookDeliveryAdmissionRepo } from "./webhook-delivery-admission.repo";
import type { WebhookDeliveryDetachRepo } from "./webhook-delivery-detach.repo";
import type { WebhookDeliveryQueueRepo, WebhookDeliveryClaim } from "./webhook-delivery-queue.repo";

import { WebhookDeliveryStatus } from "@/generated/prisma";

import type { EventLog, Prisma, Webhook } from "@/generated/prisma";

import { type WebhookDeliveryDto } from "./get-webhook-deliveries.interactor";

import { QueryRepository } from "@/core/base/query-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { type GetQueryParams } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { eventEnvelope, type EventEnvelope } from "@/features/event/event-envelope";

const LEASE_MS = 60_000;

export class PrismaWebhookDeliveryRepo
  extends QueryRepository<Prisma.WebhookDeliveryWhereInput>
  implements
    GetWebhookDeliveriesRepo,
    GetWebhookDeliveryByIdRepo,
    FindWebhookDeliveriesByIdsRepo,
    WebhookDeliveryAdmissionRepo,
    WebhookDeliveryDetachRepo,
    WebhookDeliveryQueueRepo
{
  constructor(private readonly recordReader: RecordRecipientReader) {
    super();
  }

  private get baseSelect() {
    return {
      id: true,
      url: true,
      event: true,
      eventLog: true,
      nextAttemptAt: true,
      statusCode: true,
      responseMessage: true,
      success: true,
      status: true,
      deliveredAt: true,
      createdAt: true,
    } as const;
  }

  getSearchableFields() {
    return [{ field: "event" }, { field: "url" }];
  }

  getSortableFields() {
    return [{ field: "createdAt", resolvedFields: ["createdAt"] }];
  }

  getFilterableFields() {
    return Promise.resolve([
      { field: FilterFieldKey.event, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.event] },
      { field: FilterFieldKey.url, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.url] },
      { field: FilterFieldKey.webhookId, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.webhookId] },
      { field: FilterFieldKey.createdAt, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.createdAt] },
    ]);
  }

  async getItems(params: GetQueryParams) {
    const args = await this.buildQueryArgs(params, { companyId: this.companyId });

    const deliveries = await this.prisma.webhookDelivery.findMany({
      ...args,
      select: this.baseSelect,
    });

    return Promise.all(deliveries.map((delivery) => this.toVisibleDelivery(delivery)));
  }

  private async toVisibleDelivery(delivery: {
    id: string;
    url: string;
    event: string;
    eventLog: EventLog | null;
    nextAttemptAt: Date | null;
    statusCode: number | null;
    responseMessage: string | null;
    success: boolean;
    status: WebhookDeliveryStatus;
    deliveredAt: Date | null;
    createdAt: Date;
  }): Promise<WebhookDeliveryDto> {
    const event = delivery.eventLog;
    const requestBody: EventEnvelope | null = !event
      ? null
      : event.subjectKind === "record"
        ? await this.recordReader.readEvent({ companyId: this.companyId, userId: this.userId, eventId: event.id })
        : eventEnvelope(event);
    return {
      id: delivery.id,
      url: delivery.url,
      event: delivery.event,
      requestBody,
      nextAttemptAt: delivery.nextAttemptAt,
      statusCode: delivery.statusCode,
      responseMessage: delivery.responseMessage,
      success: delivery.success,
      status: delivery.status,
      deliveredAt: delivery.deliveredAt,
      createdAt: delivery.createdAt,
    };
  }

  async getCount(params: GetQueryParams) {
    const { where } = await this.buildQueryArgs(params, { companyId: this.companyId });

    return this.prisma.webhookDelivery.count({ where });
  }

  async createRetryById(id: string, webhookId?: string): ReturnType<GetWebhookDeliveryByIdRepo["createRetryById"]> {
    const { companyId } = this.user;
    const original = await this.prisma.webhookDelivery.findFirst({
      where: { id, companyId, ...(webhookId ? { webhookId } : {}) },
    });
    if (!original) return { status: "missing" };
    if (
      (original.status !== WebhookDeliveryStatus.success && original.status !== WebhookDeliveryStatus.failed) ||
      original.nextAttemptAt
    )
      return { status: "in_progress" };
    if (!original.webhookId) return { status: "unavailable" };
    const webhook = await this.prisma.webhook.findFirst({ where: { companyId, id: original.webhookId } });
    if (!webhook) return { status: "unavailable" };
    if (!webhook.enabled || !webhook.events.includes(original.event)) return { status: "webhook_disabled" };
    if (!original.eventId) return { status: "unavailable" };
    if (!original.subscriptionRevision) {
      const retry = await this.prisma.webhookDelivery.create({
        data: {
          companyId,
          webhookId: webhook.id,
          eventId: original.eventId,
          url: webhook.url,
          event: original.event,
          requestBody: { eventId: original.eventId },
        },
        select: { id: true },
      });
      return { status: "created", id: retry.id };
    }
    const subscription = await this.prisma.recordEventSubscription.findFirst({
      where: { companyId, id: webhook.id, kind: "webhook", enabled: true },
    });
    if (!subscription || subscription.revision !== original.subscriptionRevision) return { status: "stale" };
    if (subscription.ownerUserId !== this.userId && !this.user.role?.isSystemRole) return { status: "forbidden" };

    const retry = await this.prisma.webhookDelivery.create({
      data: {
        companyId,
        webhookId: webhook.id,
        eventId: original.eventId,
        subscriptionRevision: original.subscriptionRevision,
        url: webhook.url,
        event: original.event,
        requestBody: { eventId: original.eventId },
      },
      select: { id: true },
    });
    return { status: "created", id: retry.id };
  }

  async findIds(ids: Set<string>) {
    if (ids.size === 0) return new Set<string>();

    const { companyId } = this.user;

    const deliveries = await this.prisma.webhookDelivery.findMany({
      where: { id: { in: Array.from(ids) }, companyId },
      select: { id: true },
    });

    return new Set(deliveries.map((delivery) => delivery.id));
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

  async detachWebhookDeliveries(companyId: string, webhookId: string): Promise<void> {
    await this.prisma.webhookDelivery.updateMany({
      where: { companyId, webhookId },
      data: { webhookId: null, nextAttemptAt: null, leaseToken: null, leaseExpiresAt: null },
    });
  }

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
