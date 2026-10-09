import type { GetWebhookDeliveriesRepo } from "@/features/webhook/get-webhook-deliveries.repo";
import type { GetWebhookDeliveryByIdRepo } from "./get-webhook-delivery-by-id.repo";
import type { FindWebhookDeliveriesByIdsRepo } from "./find-webhook-deliveries-by-ids.repo";
import type { RecordRecipientReader } from "@/features/records/record-recipient-reader";

import { WebhookDeliveryStatus } from "@/generated/prisma";

import type { EventLog, Prisma } from "@/generated/prisma";

import { type WebhookDeliveryDto } from "./get-webhook-deliveries.interactor";

import { QueryRepository } from "@/core/base/query-repository";
import { type GetQueryParams } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { eventEnvelope, type EventEnvelope } from "@/features/event/event-envelope";

export class PrismaWebhookDeliveryRepo
  extends QueryRepository<Prisma.WebhookDeliveryWhereInput>
  implements GetWebhookDeliveriesRepo, GetWebhookDeliveryByIdRepo, FindWebhookDeliveriesByIdsRepo
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

  async createRetryById(id: string): ReturnType<GetWebhookDeliveryByIdRepo["createRetryById"]> {
    const { companyId } = this.user;
    const original = await this.prisma.webhookDelivery.findFirst({ where: { id, companyId } });
    if (!original) return { status: "missing" };
    if (
      (original.status !== WebhookDeliveryStatus.success && original.status !== WebhookDeliveryStatus.failed) ||
      original.nextAttemptAt
    )
      return { status: "unavailable" };
    if (!original.webhookId) return { status: "unavailable" };
    const webhook = await this.prisma.webhook.findFirst({ where: { companyId, id: original.webhookId } });
    if (!webhook?.enabled || !webhook.events.includes(original.event)) return { status: "unavailable" };
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
}
