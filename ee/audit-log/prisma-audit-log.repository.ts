import type { DomainEventMap } from "@/features/event/domain-events";
import type { GetAuditLogsByEntityIdRepo } from "./get/get-audit-logs-by-entity-id.interactor";
import type { GetAuditLogsRepo } from "./get/get-audit-logs.interactor";
import type { CreateAuditLogRepo } from "@/features/event/event.service";
import type { DomainEvent } from "@/features/event/domain-events";
import type { RepoArgs } from "@/core/utils/types";

import type { Prisma } from "@/generated/prisma";

import { type AuditLogDto } from "./get/get-audit-logs-by-entity-id.interactor";

import { transactionStorage } from "@/core/decorators/transaction-context";
import { BaseRepository } from "@/core/base/base-repository";
import { type GetQueryParams } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";

export class PrismaAuditLogRepo
  extends BaseRepository<Prisma.AuditLogWhereInput>
  implements GetAuditLogsByEntityIdRepo, GetAuditLogsRepo, CreateAuditLogRepo
{
  private get baseSelect() {
    return {
      id: true,
      event: true,
      eventData: true,
      createdAt: true,
      entityId: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          email: true,
        },
      },
    } as const;
  }

  getSearchableFields() {
    return [{ field: "entityId" }];
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
    const args = await this.buildQueryArgs(params, { companyId: this.companyId });

    const auditLogs = await this.prisma.auditLog.findMany({
      ...args,
      select: this.baseSelect,
    });

    return auditLogs.map((log) => ({
      id: log.id,
      event: log.event as DomainEvent,
      eventData: log.eventData as DomainEventMap[DomainEvent],
      createdAt: log.createdAt,
      user: {
        id: log.user.id,
        firstName: log.user.firstName,
        lastName: log.user.lastName,
        avatarUrl: log.user.avatarUrl,
        email: log.user.email,
      },
      entityId: log.entityId,
    }));
  }

  async getCount(params: GetQueryParams) {
    const { where } = await this.buildQueryArgs(params, { companyId: this.companyId });

    return this.prisma.auditLog.count({ where });
  }

  async log(args: RepoArgs<CreateAuditLogRepo, "log">): Promise<void> {
    const { id: userId, companyId } = this.user;

    const data = { ...args, eventData: args.eventData as Prisma.InputJsonValue, userId, companyId };

    const store = transactionStorage.getStore();

    if (store) {
      store.auditLogBatch.push(data);
      return;
    }

    await this.prisma.auditLog.create({ data });
  }

  async getAuditLogsByEntityId(entityId: string): Promise<AuditLogDto[]> {
    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        entityId,
        companyId: this.companyId,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: this.baseSelect,
    });

    return auditLogs.map((log) => ({
      id: log.id,
      event: log.event as DomainEvent,
      eventData: log.eventData as DomainEventMap[DomainEvent],
      createdAt: log.createdAt,
      user: {
        id: log.user.id,
        firstName: log.user.firstName,
        lastName: log.user.lastName,
        avatarUrl: log.user.avatarUrl,
        email: log.user.email,
      },
      entityId: log.entityId,
    }));
  }
}
