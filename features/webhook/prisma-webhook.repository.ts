import type { RecordEventSubscriptionRepo } from "@/features/records/record-event-subscription.repo";
import {
  RecordTriggerDefinitionSchema,
  RecordTriggerSourceSchema,
} from "@/features/records/record-event-subscription.schema";
import { RecordWriteError } from "@/features/records/record-write.service";
import { CustomErrorCode } from "@/core/validation/validation.types";
import type { RepoArgs } from "@/core/utils/types";
import type { GetWebhooksRepo } from "@/features/webhook/get-webhooks.repo";
import type { UpsertWebhookRepo } from "./upsert-webhook.repo";
import type { DeleteWebhookRepo } from "./delete-webhook.repo";
import type { FindWebhooksByIdsRepo } from "./find-webhooks-by-ids.repo";
import type { WebhookDto } from "./webhook.schema";
import type { GetWebhooksForEventRepo } from "@/features/event/get-webhooks-for-event.repo";
import type { GetWebhookByIdRepo } from "./get-webhook-by-id.interactor";

import { Action, Prisma, Resource } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { transactionStorage } from "@/core/decorators/transaction-context";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { type GetQueryParams } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { parseStoredWebhookHeaders } from "./webhook-headers";
import { WEBHOOK_MASKED_VALUE } from "./webhook.schema";

export class PrismaWebhookRepo
  extends BaseRepository<Prisma.WebhookWhereInput>
  implements
    GetWebhooksRepo,
    UpsertWebhookRepo,
    DeleteWebhookRepo,
    GetWebhooksForEventRepo,
    FindWebhooksByIdsRepo,
    GetWebhookByIdRepo
{
  constructor(private readonly subscriptions: RecordEventSubscriptionRepo) {
    super();
  }

  private async withRecordSubscriptions(rows: WebhookDto[]): Promise<WebhookDto[]> {
    const ids = rows.filter((row) => row.events.some((event) => event.startsWith("record."))).map((row) => row.id);
    const subscriptions = await this.subscriptions.findCompanyWide(this.companyId, ids);
    const byId = new Map(subscriptions.filter((row) => row.kind === "webhook").map((row) => [row.id, row]));
    return rows.map((row) => {
      const subscription = byId.get(row.id);
      return {
        ...row,
        recordOwnerUserId: subscription?.ownerUserId ?? null,
        recordSources: subscription?.sources?.length
          ? subscription.sources.map((source) => RecordTriggerSourceSchema.parse(source))
          : null,
        recordTrigger: subscription?.query
          ? RecordTriggerDefinitionSchema.parse({
              query: subscription.query,
              changedFieldIds: subscription.changedFieldIds,
            })
          : null,
      };
    });
  }

  private async assertWriter(action: "update" | "delete", ownerUserId?: string | null) {
    const actor = await this.prisma.user.findFirst({
      where: { companyId: this.companyId, id: this.userId, status: "active", role: { companyId: this.companyId } },
      select: {
        role: {
          select: {
            isSystemRole: true,
            permissions: { where: { companyId: this.companyId, resource: "api", action }, select: { action: true } },
          },
        },
      },
    });
    if (
      !actor?.role ||
      (!actor.role.isSystemRole && (!actor.role.permissions.length || (ownerUserId && ownerUserId !== this.userId)))
    )
      throw new RecordWriteError(CustomErrorCode.permissionDenied, "authorization");
  }

  private async saveRecordSubscription(
    webhook: WebhookDto,
    input: RepoArgs<UpsertWebhookRepo, "upsertWebhookOrThrow">,
    previous?: WebhookDto,
  ) {
    const events = webhook.events.filter(
      (event): event is "record.created" | "record.updated" | "record.deleted" =>
        event === "record.created" || event === "record.updated" || event === "record.deleted",
    );
    if (!events.length) {
      if (input.recordTrigger || input.recordSources?.length || input.recordOwnerUserId)
        throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
      await this.subscriptions.remove(webhook.id);
      return;
    }
    if (
      (!previous?.recordOwnerUserId ||
        input.recordTrigger !== undefined ||
        input.recordSources !== undefined ||
        input.recordOwnerUserId !== undefined) &&
      input.expectedSchemaRevision === undefined
    )
      throw new RecordWriteError(CustomErrorCode.recordSchemaChanged, "conflict");
    const sources =
      input.recordSources !== undefined
        ? input.recordSources
        : input.recordTrigger !== undefined
          ? null
          : previous?.recordSources;
    const trigger = sources?.length
      ? null
      : input.recordTrigger === undefined
        ? previous?.recordTrigger
        : input.recordTrigger;
    await this.subscriptions.save(
      {
        id: webhook.id,
        kind: "webhook",
        ownerUserId: input.recordOwnerUserId ?? previous?.recordOwnerUserId ?? this.userId,
        typeId: trigger?.query.typeId ?? null,
        query: trigger?.query ?? null,
        sources: sources ?? null,
        changedFieldIds: trigger?.changedFieldIds ?? [],
        events,
        enabled: webhook.enabled,
      },
      input.expectedSchemaRevision,
    );
  }

  private get baseSelect() {
    return {
      id: true,
      url: true,
      description: true,
      events: true,
      secret: true,
      headers: true,
      bodyTemplate: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }

  private toWebhookDto(row: { secret: string | null; headers: unknown }): WebhookDto {
    const headers = parseStoredWebhookHeaders(row.headers);
    const webhook = { ...row, headers: Object.keys(headers).length > 0 ? headers : null } as WebhookDto;

    if (this.hasPermission(Resource.api, Action.update)) return webhook;

    return {
      ...webhook,
      secret: webhook.secret ? WEBHOOK_MASKED_VALUE : webhook.secret,
      headers: webhook.headers
        ? Object.fromEntries(Object.keys(webhook.headers).map((name) => [name, WEBHOOK_MASKED_VALUE]))
        : null,
    };
  }

  getSearchableFields() {
    return [{ field: "url" }];
  }

  getSortableFields() {
    return [
      { field: "name", resolvedFields: ["url"], collate: true },
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
    const rows = await this.list({
      model: "webhook",
      baseWhere: { companyId: this.companyId },
      select: this.baseSelect,
      params,
      map: (webhook: Prisma.WebhookGetPayload<{ select: PrismaWebhookRepo["baseSelect"] }>) =>
        this.toWebhookDto(webhook),
    });
    return this.withRecordSubscriptions(rows);
  }

  async getCount(params: GetQueryParams) {
    const { where } = await this.buildQueryArgs(params, { companyId: this.companyId });

    return this.prisma.webhook.count({ where });
  }

  @Transaction
  async upsertWebhookOrThrow(args: RepoArgs<UpsertWebhookRepo, "upsertWebhookOrThrow">) {
    const { companyId } = this.user;
    const { id, ...webhookData } = args;
    const previous = id ? await this.getWebhookByIdOrThrow(id) : undefined;
    await this.assertWriter("update", previous?.recordOwnerUserId);

    if (id) {
      await this.prisma.webhook.findFirstOrThrow({ where: { id, companyId } });

      await this.prisma.webhook.update({
        where: { id, companyId },
        data: {
          url: webhookData.url,
          events: webhookData.events,
          description: webhookData.description,
          secret: webhookData.secret,
          headers: webhookData.headers === undefined ? undefined : (webhookData.headers ?? Prisma.DbNull),
          bodyTemplate: webhookData.bodyTemplate,
          enabled: webhookData.enabled,
        },
      });

      await this.saveRecordSubscription(await this.getWebhookByIdOrThrow(id), args, previous);
      return this.getWebhookByIdOrThrow(id);
    }

    const created = await this.prisma.webhook.create({
      data: {
        companyId,
        url: webhookData.url as string,
        events: webhookData.events as WebhookDto["events"],
        description: webhookData.description ?? null,
        secret: webhookData.secret ?? null,
        headers: webhookData.headers ?? Prisma.DbNull,
        bodyTemplate: webhookData.bodyTemplate ?? null,
        enabled: webhookData.enabled ?? true,
      },
      select: { id: true },
    });

    await this.saveRecordSubscription(await this.getWebhookByIdOrThrow(created.id), args);
    return this.getWebhookByIdOrThrow(created.id);
  }

  @Transaction
  async deleteWebhookOrThrow(id: RepoArgs<DeleteWebhookRepo, "deleteWebhookOrThrow">) {
    const { companyId } = this.user;

    const webhook = await this.prisma.webhook.findFirstOrThrow({
      where: { id, companyId },
      select: this.baseSelect,
    });

    const dto = (await this.withRecordSubscriptions([this.toWebhookDto(webhook)]))[0];
    await this.assertWriter("delete", dto.recordOwnerUserId);
    await this.subscriptions.remove(id);
    await this.prisma.webhookDelivery.updateMany({
      where: { companyId, webhookId: id },
      data: { webhookId: null, nextAttemptAt: null, leaseToken: null, leaseExpiresAt: null },
    });
    await this.prisma.webhook.delete({
      where: { id, companyId },
    });

    return dto;
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

  @BypassTenantGuard
  async getWebhooksForEventUnscoped(event: string, companyId: string) {
    return this.prisma.webhook.findMany({ where: { companyId, enabled: true, events: { has: event } } });
  }

  async getWebhookByIdOrThrow(id: string) {
    const { companyId } = this.user;

    const webhook = await this.prisma.webhook.findFirstOrThrow({
      where: { id, companyId },
      select: this.baseSelect,
    });

    return (await this.withRecordSubscriptions([this.toWebhookDto(webhook)]))[0];
  }

  async getWebhookById(id: string) {
    const { companyId } = this.user;

    const webhook = await this.prisma.webhook.findFirst({
      where: { id, companyId },
      select: this.baseSelect,
    });

    return webhook ? (await this.withRecordSubscriptions([this.toWebhookDto(webhook)]))[0] : null;
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
