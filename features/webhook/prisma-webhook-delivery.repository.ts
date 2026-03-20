import { Prisma } from "@/generated/prisma";

import { GetWebhookDeliveriesRepo, type WebhookDeliveryDto } from "./get-webhook-deliveries.interactor";
import { GetWebhookDeliveryByIdRepo } from "./resend-webhook-delivery.interactor";
import { CreateWebhookDeliveryRepo } from "./webhook.service";

import { BaseRepository } from "@/core/base/base-repository";
import { Repository } from "@/core/decorators/repository.decorator";
import { type GetQueryParams } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { DomainEvent } from "@/features/event/domain-events";

@Repository
export class PrismaWebhookDeliveryRepo
  extends BaseRepository<Prisma.WebhookDeliveryWhereInput>
  implements GetWebhookDeliveriesRepo, GetWebhookDeliveryByIdRepo, CreateWebhookDeliveryRepo
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
    const companyId = this.user.companyId;

    const delivery = await this.prisma.webhookDelivery.findFirstOrThrow({
      where: {
        id,
        companyId,
      },
      select: {
        ...this.baseSelect,
      },
    });

    return {
      ...delivery,
      event: delivery.event as DomainEvent,
      requestBody: delivery.requestBody as WebhookDeliveryDto["requestBody"],
    };
  }

  async createDelivery(args: Parameters<CreateWebhookDeliveryRepo["createDelivery"]>[0]): Promise<void> {
    await this.prisma.webhookDelivery.create({
      data: {
        url: args.url,
        companyId: args.companyId,
        event: args.event,
        requestBody: args.requestBody as Prisma.InputJsonValue,
        statusCode: args.statusCode,
        responseMessage: args.responseMessage,
        success: args.success,
      },
    });
  }
}
