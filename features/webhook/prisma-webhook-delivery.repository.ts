import type { GetWebhookDeliveriesRepo } from "./get-webhook-deliveries.interactor";
import type { GetWebhookDeliveryByIdRepo } from "./resend-webhook-delivery.interactor";
import type { DeliverWebhookRepo } from "./deliver-webhook.interactor";
import type { CreateWebhookDeliveryRepo } from "@/features/webhook/create-webhook-delivery.repo";
import type { DomainEvent } from "@/features/event/domain-events";
import type { RepoArgs } from "@/core/utils/types";

import { WebhookDeliveryStatus } from "@/generated/prisma";

import type { Prisma } from "@/generated/prisma";

import { type WebhookDeliveryDto } from "./get-webhook-deliveries.interactor";

import { transactionStorage } from "@/core/decorators/transaction-context";
import { BaseRepository } from "@/core/base/base-repository";
import { type GetQueryParams } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { prisma } from "@/prisma/db";

export class PrismaWebhookDeliveryRepo
  extends BaseRepository<Prisma.WebhookDeliveryWhereInput>
  implements GetWebhookDeliveriesRepo, GetWebhookDeliveryByIdRepo, CreateWebhookDeliveryRepo, DeliverWebhookRepo
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
      { field: FilterFieldKey.createdAt, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.createdAt] },
    ]);
  }

  async getItems(params: GetQueryParams) {
    const args = await this.buildQueryArgs(params, { companyId: this.user.companyId });

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
    const { where } = await this.buildQueryArgs(params, { companyId: this.user.companyId });

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

  async create(args: RepoArgs<CreateWebhookDeliveryRepo, "create">): Promise<string[]> {
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

  async getSecret(args: RepoArgs<DeliverWebhookRepo, "getSecret">): Promise<string | null> {
    const { companyId, url } = args;

    const webhook = await this.prisma.webhook.findFirst({
      where: { companyId, url },
      select: { secret: true },
    });

    return webhook?.secret ?? null;
  }

  async markSuccess(args: RepoArgs<DeliverWebhookRepo, "markSuccess">): Promise<void> {
    const { id, ...rest } = args;

    await prisma.webhookDelivery.update({
      where: { id },
      data: {
        ...rest,
        status: WebhookDeliveryStatus.success,
        success: true,
        deliveredAt: new Date(),
      },
    });
  }

  async markFailed(args: RepoArgs<DeliverWebhookRepo, "markFailed">): Promise<void> {
    const { id, ...rest } = args;

    await prisma.webhookDelivery.update({
      where: { id },
      data: {
        ...rest,
        status: WebhookDeliveryStatus.failed,
        success: false,
      },
    });
  }
}
