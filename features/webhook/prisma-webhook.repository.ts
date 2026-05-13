import type { RepoArgs } from "@/core/utils/types";
import type { GetWebhooksRepo } from "./get-webhooks.interactor";
import type { UpsertWebhookRepo } from "./upsert-webhook.interactor";
import type { DeleteWebhookRepo } from "./delete-webhook.interactor";
import type { WebhookDto } from "./webhook.schema";
import type { GetWebhooksForEventRepo } from "@/features/event/event.service";

import type { Prisma } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { transactionStorage } from "@/core/decorators/transaction-context";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { type GetQueryParams } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";

export class PrismaWebhookRepo
  extends BaseRepository<Prisma.WebhookWhereInput>
  implements GetWebhooksRepo, UpsertWebhookRepo, DeleteWebhookRepo, GetWebhooksForEventRepo
{
  private get baseSelect() {
    return {
      id: true,
      url: true,
      description: true,
      events: true,
      secret: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }

  getSearchableFields() {
    return [{ field: "url" }];
  }

  getSortableFields() {
    return [
      { field: "name", resolvedFields: ["url"] },
      { field: "createdAt", resolvedFields: ["createdAt"] },
      { field: "updatedAt", resolvedFields: ["updatedAt"] },
    ];
  }

  getFilterableFields() {
    return Promise.resolve([
      { field: FilterFieldKey.updatedAt, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.updatedAt] },
      { field: FilterFieldKey.createdAt, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.createdAt] },
    ]);
  }

  async getItems(params: GetQueryParams) {
    const args = await this.buildQueryArgs(params, { companyId: this.user.companyId });

    const webhooks = await this.prisma.webhook.findMany({
      ...args,
      select: this.baseSelect,
    });

    return webhooks as WebhookDto[];
  }

  async getCount(params: GetQueryParams) {
    const { where } = await this.buildQueryArgs(params, { companyId: this.user.companyId });

    return this.prisma.webhook.count({ where });
  }

  @Transaction
  async upsertWebhookOrThrow(args: RepoArgs<UpsertWebhookRepo, "upsertWebhookOrThrow">) {
    const { companyId } = this.user;
    const { id, ...webhookData } = args;

    if (id) {
      await this.prisma.webhook.findFirstOrThrow({
        where: {
          id,
          companyId,
        },
      });
    }

    const webhookPayload = {
      url: webhookData.url,
      description: webhookData.description ?? null,
      events: webhookData.events,
      secret: webhookData.secret ?? null,
      enabled: webhookData.enabled,
      companyId,
    };

    const webhook = await this.prisma.webhook.upsert({
      where: {
        id: id ?? "",
      },
      create: webhookPayload,
      update: webhookPayload,
      select: {
        id: true,
      },
    });

    const updatedWebhook = await this.prisma.webhook.findFirstOrThrow({
      where: { id: webhook.id, companyId },
      select: this.baseSelect,
    });

    return updatedWebhook as WebhookDto;
  }

  @Transaction
  async deleteWebhookOrThrow(id: RepoArgs<DeleteWebhookRepo, "deleteWebhookOrThrow">) {
    const { companyId } = this.user;

    const webhook = await this.prisma.webhook.findFirstOrThrow({
      where: { id, companyId },
      select: this.baseSelect,
    });

    await this.prisma.webhook.delete({
      where: { id, companyId },
    });

    return webhook as WebhookDto;
  }

  async getWebhooksForEvent(event: string) {
    const { companyId } = this.user;

    const store = transactionStorage.getStore();

    if (store) {
      const webhooks = (store.enabledWebhooks ??= await this.prisma.webhook.findMany({
        where: { companyId, enabled: true },
      }));

      return webhooks.filter((webhook) => webhook.events.includes(event));
    }

    return this.prisma.webhook.findMany({ where: { companyId, enabled: true, events: { has: event } } });
  }

  async getWebhookByIdOrThrow(id: string) {
    const { companyId } = this.user;

    const webhook = await this.prisma.webhook.findFirstOrThrow({
      where: { id, companyId },
      select: this.baseSelect,
    });

    return webhook as WebhookDto;
  }
}
