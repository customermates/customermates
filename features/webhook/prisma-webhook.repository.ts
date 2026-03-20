import type { RepoArgs } from "@/core/utils/types";

import { Prisma } from "@/generated/prisma";

import { GetWebhooksRepo } from "./get-webhooks.interactor";
import { UpsertWebhookRepo } from "./upsert-webhook.interactor";
import { DeleteWebhookRepo } from "./delete-webhook.interactor";
import { type WebhookDto } from "./webhook.schema";
import { GetWebhookByUrlRepo } from "./resend-webhook-delivery.interactor";
import { GetWebhooksForEventRepo } from "./webhook.service";

import { BaseRepository } from "@/core/base/base-repository";
import { Repository } from "@/core/decorators/repository.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { type GetQueryParams } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";

@Repository
export class PrismaWebhookRepo
  extends BaseRepository<Prisma.WebhookWhereInput>
  implements GetWebhooksRepo, UpsertWebhookRepo, DeleteWebhookRepo, GetWebhookByUrlRepo, GetWebhooksForEventRepo
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
  async upsertWebhookOrThrow(args: RepoArgs<UpsertWebhookRepo, "upsertWebhookOrThrow">): Promise<WebhookDto> {
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
  async deleteWebhookOrThrow(id: RepoArgs<DeleteWebhookRepo, "deleteWebhookOrThrow">): Promise<WebhookDto> {
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

  async getWebhooksForEvent(event: string, companyId: string): Promise<WebhookDto[]> {
    const webhooks = await this.prisma.webhook.findMany({
      where: {
        companyId,
        enabled: true,
        events: {
          has: event,
        },
      },
      select: this.baseSelect,
    });

    return webhooks as WebhookDto[];
  }

  async getWebhookByUrlOrThrow(url: string) {
    const companyId = this.user.companyId;

    const webhook = await this.prisma.webhook.findFirstOrThrow({
      where: {
        url,
        companyId,
      },
    });

    return webhook;
  }

  async getWebhookByIdOrThrow(id: string): Promise<WebhookDto> {
    const { companyId } = this.user;

    const webhook = await this.prisma.webhook.findFirstOrThrow({
      where: { id, companyId },
      select: this.baseSelect,
    });

    return webhook as WebhookDto;
  }
}
