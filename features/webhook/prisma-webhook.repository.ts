import type { RepoArgs } from "@/core/utils/types";
import type { GetWebhooksRepo } from "./get-webhooks.interactor";
import type { UpsertWebhookRepo } from "./upsert-webhook.interactor";
import type { DeleteWebhookRepo } from "./delete-webhook.interactor";
import type { FindWebhooksByIdsRepo } from "./find-webhooks-by-ids.repo";
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
  implements GetWebhooksRepo, UpsertWebhookRepo, DeleteWebhookRepo, GetWebhooksForEventRepo, FindWebhooksByIdsRepo
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
    const args = await this.buildQueryArgs(params, { companyId: this.companyId });

    const webhooks = await this.prisma.webhook.findMany({
      ...args,
      select: this.baseSelect,
    });

    return webhooks as WebhookDto[];
  }

  async getCount(params: GetQueryParams) {
    const { where } = await this.buildQueryArgs(params, { companyId: this.companyId });

    return this.prisma.webhook.count({ where });
  }

  @Transaction
  async upsertWebhookOrThrow(args: RepoArgs<UpsertWebhookRepo, "upsertWebhookOrThrow">) {
    const { companyId } = this.user;
    const { id, ...webhookData } = args;

    if (id) {
      await this.prisma.webhook.findFirstOrThrow({ where: { id, companyId } });

      await this.prisma.webhook.update({
        where: { id, companyId },
        data: {
          url: webhookData.url,
          events: webhookData.events,
          description: webhookData.description,
          secret: webhookData.secret,
          enabled: webhookData.enabled,
        },
      });

      return this.getWebhookByIdOrThrow(id);
    }

    const created = await this.prisma.webhook.create({
      data: {
        companyId,
        url: webhookData.url as string,
        events: webhookData.events as WebhookDto["events"],
        description: webhookData.description ?? null,
        secret: webhookData.secret ?? null,
        enabled: webhookData.enabled ?? true,
      },
      select: { id: true },
    });

    return this.getWebhookByIdOrThrow(created.id);
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

  async getWebhookById(id: string) {
    const { companyId } = this.user;

    const webhook = await this.prisma.webhook.findFirst({
      where: { id, companyId },
      select: this.baseSelect,
    });

    return webhook as WebhookDto | null;
  }

  async findIds(ids: Set<string>) {
    if (ids.size === 0) return new Set<string>();

    const { companyId } = this.user;

    const webhooks = await this.prisma.webhook.findMany({
      where: { id: { in: Array.from(ids) }, companyId },
      select: { id: true },
    });

    return new Set(webhooks.map((webhook) => webhook.id));
  }
}
