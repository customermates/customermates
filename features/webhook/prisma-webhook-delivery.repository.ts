import type { GetWebhookDeliveriesRepo } from "./get-webhook-deliveries.interactor";
import type { GetWebhookDeliveryByIdRepo } from "./resend-webhook-delivery.interactor";
import type { DeliverWebhookRepo } from "./deliver-webhook.interactor";
import type { FindWebhookDeliveriesByIdsRepo } from "./find-webhook-deliveries-by-ids.repo";
import type { CreateWebhookDeliveryRepo } from "@/features/webhook/create-webhook-delivery.repo";
import type { DomainEvent } from "@/features/event/domain-events";
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

export class PrismaWebhookDeliveryRepo
  extends BaseRepository<Prisma.WebhookDeliveryWhereInput>
  implements
    GetWebhookDeliveriesRepo,
    GetWebhookDeliveryByIdRepo,
    CreateWebhookDeliveryRepo,
    DeliverWebhookRepo,
    FindWebhookDeliveriesByIdsRepo
{
  private get baseSelect() {
    return {
      id: true,
      url: true,
      event: true,
      requestBody: true,
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

    return deliveries.map((delivery) => ({
      ...delivery,
      event: delivery.event as DomainEvent,
      requestBody: delivery.requestBody as WebhookDeliveryDto["requestBody"],
    }));
  }

  async getCount(params: GetQueryParams) {
    const { where } = await this.buildQueryArgs(params, { companyId: this.companyId });

    return this.prisma.webhookDelivery.count({ where });
  }

  async getDeliveryByIdOrThrow(id: string) {
    const { companyId } = this.user;

    const delivery = await this.prisma.webhookDelivery.findFirstOrThrow({
      where: { id, companyId },
      select: this.baseSelect,
    });

    return {
      ...delivery,
      event: delivery.event as DomainEvent,
      requestBody: delivery.requestBody as WebhookDeliveryDto["requestBody"],
    };
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
    args: { url: string; event: string; requestBody: Record<string, unknown> }[],
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

  @BypassTenantGuard
  async getSecretUnscoped(args: RepoArgs<DeliverWebhookRepo, "getSecretUnscoped">) {
    const { companyId, url } = args;

    const webhook = await this.prisma.webhook.findFirst({
      where: { companyId, url },
      select: { secret: true },
    });

    return webhook?.secret ?? null;
  }

  @BypassTenantGuard
  async markSuccessUnscoped(args: RepoArgs<DeliverWebhookRepo, "markSuccessUnscoped">) {
    const { id, companyId, ...rest } = args;

    await this.prisma.webhookDelivery.update({
      where: { id, companyId },
      data: {
        ...rest,
        status: WebhookDeliveryStatus.success,
        success: true,
        deliveredAt: new Date(),
      },
    });
  }

  @BypassTenantGuard
  async markFailedUnscoped(args: RepoArgs<DeliverWebhookRepo, "markFailedUnscoped">) {
    const { id, companyId, ...rest } = args;

    await this.prisma.webhookDelivery.update({
      where: { id, companyId },
      data: {
        ...rest,
        status: WebhookDeliveryStatus.failed,
        success: false,
      },
    });
  }
}
