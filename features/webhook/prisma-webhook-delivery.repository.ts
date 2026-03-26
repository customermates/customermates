import { Prisma, WebhookDeliveryStatus } from "@/generated/prisma";

import { GetWebhookDeliveriesRepo, type WebhookDeliveryDto } from "./get-webhook-deliveries.interactor";
import { GetWebhookDeliveryByIdRepo } from "./resend-webhook-delivery.interactor";
import {
  ClaimPendingDeliveriesRepo,
  UpdateDeliveryOutcomeRepo,
  PendingDeliveryRow,
} from "./process-webhook-deliveries.interactor";

import { CreateWebhookDeliveryRepo } from "@/features/webhook/create-webhook-delivery.repo";
import { transactionStorage } from "@/core/decorators/transaction-context";
import { BaseRepository } from "@/core/base/base-repository";
import { Repository } from "@/core/decorators/repository.decorator";
import { type GetQueryParams } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { DomainEvent } from "@/features/event/domain-events";
import { RepoArgs } from "@/core/utils/types";
import { prisma } from "@/prisma/db";

@Repository
export class PrismaWebhookDeliveryRepo
  extends BaseRepository<Prisma.WebhookDeliveryWhereInput>
  implements
    GetWebhookDeliveriesRepo,
    GetWebhookDeliveryByIdRepo,
    CreateWebhookDeliveryRepo,
    ClaimPendingDeliveriesRepo,
    UpdateDeliveryOutcomeRepo
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

  async create(args: RepoArgs<CreateWebhookDeliveryRepo, "create">): Promise<void> {
    if (args.length === 0) return;

    const { companyId } = this.user;

    const data = args.map((it) => ({
      ...it,
      companyId,
      requestBody: it.requestBody as Prisma.InputJsonValue,
      status: WebhookDeliveryStatus.pending,
      success: false,
    }));

    const store = transactionStorage.getStore();

    if (store) {
      store.webhookDeliveryBatch.push(...data);
      return;
    }

    await this.prisma.webhookDelivery.createMany({ data });
  }

  async claimPending(limit: number): Promise<PendingDeliveryRow[]> {
    return prisma.$queryRaw<PendingDeliveryRow[]>`
      WITH c AS (
        SELECT id FROM "WebhookDelivery"
        WHERE "status" = 'pending'::"WebhookDeliveryStatus"
        ORDER BY "createdAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "WebhookDelivery" AS w
      SET
        "status" = 'processing'::"WebhookDeliveryStatus",
        "lockedAt" = NOW()
      FROM c
      WHERE w.id = c.id
      RETURNING w.id, w.url, w."companyId", w.event, w."requestBody";
    `;
  }

  async markSuccess(args: RepoArgs<UpdateDeliveryOutcomeRepo, "markSuccess">): Promise<void> {
    const { id, ...rest } = args;

    await prisma.webhookDelivery.update({
      where: { id },
      data: {
        ...rest,
        status: WebhookDeliveryStatus.success,
        success: true,
        deliveredAt: new Date(),
        lockedAt: null,
      },
    });
  }

  async markFailed(args: RepoArgs<UpdateDeliveryOutcomeRepo, "markFailed">): Promise<void> {
    const { id, ...rest } = args;

    await prisma.webhookDelivery.update({
      where: { id },
      data: {
        ...rest,
        status: WebhookDeliveryStatus.failed,
        lockedAt: null,
        success: false,
      },
    });
  }
}
