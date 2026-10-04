import type { GetWebhookDeliveriesRepo } from "./get-webhook-deliveries.interactor";
import type { GetWebhookDeliveryByIdRepo } from "./resend-webhook-delivery.interactor";
import type { FindWebhookDeliveriesByIdsRepo } from "./find-webhook-deliveries-by-ids.repo";
import type { CreateWebhookDeliveryRepo } from "@/features/webhook/create-webhook-delivery.repo";
import type { RecordRecipientReader } from "@/features/records/record-recipient-reader";
import type { RepoArgs } from "@/core/utils/types";

import { WebhookDeliveryStatus } from "@/generated/prisma";

import type { Prisma } from "@/generated/prisma";

import { type WebhookDeliveryDto } from "./get-webhook-deliveries.interactor";

import { transactionStorage } from "@/core/decorators/transaction-context";
import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { type GetQueryParams } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";

function storedMessagingBody(event: string, requestBody: Prisma.JsonValue): Record<string, unknown> | null {
  if (!event.startsWith("messaging.")) return null;
  if (!requestBody || typeof requestBody !== "object" || Array.isArray(requestBody)) return null;
  return requestBody as Record<string, unknown>;
}

export class PrismaWebhookDeliveryRepo
  extends BaseRepository<Prisma.WebhookDeliveryWhereInput>
  implements
    GetWebhookDeliveriesRepo,
    GetWebhookDeliveryByIdRepo,
    CreateWebhookDeliveryRepo,
    FindWebhookDeliveriesByIdsRepo
{
  constructor(private readonly recordReader: RecordRecipientReader) {
    super();
  }

  private get baseSelect() {
    return {
      id: true,
      url: true,
      event: true,
      requestBody: true,
      recordEventId: true,
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
    recordEventId: string | null;
    requestBody: Prisma.JsonValue;
    nextAttemptAt: Date | null;
    statusCode: number | null;
    responseMessage: string | null;
    success: boolean;
    status: WebhookDeliveryStatus;
    deliveredAt: Date | null;
    createdAt: Date;
  }): Promise<WebhookDeliveryDto> {
    let requestBody: Record<string, unknown> | null = delivery.recordEventId
      ? null
      : storedMessagingBody(delivery.event, delivery.requestBody);
    if (delivery.recordEventId) {
      const envelope = await this.recordReader.readEvent({
        companyId: this.companyId,
        userId: this.userId,
        eventId: delivery.recordEventId,
      });
      if (envelope) {
        requestBody = {
          event: envelope.event,
          data: {
            userId: envelope.actorId,
            companyId: envelope.companyId,
            entityId: envelope.record.ref.recordId,
            payload: envelope,
          },
          timestamp: envelope.timestamp,
        };
      }
    }
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
    if (!original.recordEventId) {
      const storedBody = storedMessagingBody(original.event, original.requestBody);
      if (!storedBody) return { status: "unavailable" };
      const retry = await this.prisma.webhookDelivery.create({
        data: {
          companyId,
          webhookId: webhook.id,
          url: webhook.url,
          event: original.event,
          requestBody: storedBody as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      return { status: "created", id: retry.id };
    }
    if (!original.subscriptionRevision) return { status: "unavailable" };
    const subscription = await this.prisma.recordEventSubscription.findFirst({
      where: { companyId, id: webhook.id, kind: "webhook", enabled: true },
    });
    if (!subscription || subscription.revision !== original.subscriptionRevision) return { status: "stale" };
    if (subscription.ownerUserId !== this.userId && !this.user.role?.isSystemRole) return { status: "forbidden" };

    const retry = await this.prisma.webhookDelivery.create({
      data: {
        companyId,
        webhookId: webhook.id,
        recordEventId: original.recordEventId,
        subscriptionRevision: original.subscriptionRevision,
        url: webhook.url,
        event: original.event,
        requestBody: { version: 2, eventId: original.recordEventId },
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

  async create(args: RepoArgs<CreateWebhookDeliveryRepo, "create">) {
    if (args.length === 0) return [];

    const { companyId } = this.user;

    const data = args.map((it) => ({
      id: crypto.randomUUID(),
      ...it,
      companyId,
      requestBody: it.requestBody as Prisma.InputJsonValue,
      status: WebhookDeliveryStatus.pending,
      success: false,
    }));

    const store = transactionStorage.getStore();

    if (store) {
      store.webhookDeliveryBatch.push(...data);
      return data.map((d) => d.id);
    }

    await this.prisma.webhookDelivery.createMany({ data });
    return data.map((d) => d.id);
  }

  @BypassTenantGuard
  async createUnscoped(
    companyId: string,
    args: { webhookId?: string; url: string; event: string; requestBody: Record<string, unknown> }[],
  ) {
    if (args.length === 0) return [];

    const data = args.map((it) => ({
      id: crypto.randomUUID(),
      ...it,
      companyId,
      requestBody: it.requestBody as Prisma.InputJsonValue,
      status: WebhookDeliveryStatus.pending,
      success: false,
    }));

    await this.prisma.webhookDelivery.createMany({ data });
    return data.map((d) => d.id);
  }
}
