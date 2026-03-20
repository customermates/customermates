import type { DomainEventMap } from "@/features/event/domain-events";

import { Prisma } from "@/generated/prisma";

import { AuditLogRepo } from "./audit-log.service";
import { GetAuditLogsByEntityIdRepo, type AuditLogDto } from "./get/get-audit-logs-by-entity-id.interactor";
import { GetAuditLogsRepo } from "./get/get-audit-logs.interactor";

import { BaseRepository } from "@/core/base/base-repository";
import { Repository } from "@/core/decorators/repository.decorator";
import { RepoArgs } from "@/core/utils/types";
import { type GetQueryParams } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { DomainEvent } from "@/features/event/domain-events";

@Repository
export class PrismaAuditLogRepo
  extends BaseRepository<Prisma.AuditLogWhereInput>
  implements AuditLogRepo, GetAuditLogsByEntityIdRepo, GetAuditLogsRepo
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
    const args = await this.buildQueryArgs(params, { companyId: this.user.companyId });

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
    const { where } = await this.buildQueryArgs(params, { companyId: this.user.companyId });

    return this.prisma.auditLog.count({ where });
  }

  async log(args: RepoArgs<AuditLogRepo, "log">) {
    await this.prisma.auditLog.create({
      data: {
        event: args.event,
        eventData: args.payload,
        companyId: args.payload.companyId,
        userId: args.payload.userId,
        entityId: args.payload.entityId,
      },
    });
  }

  async getAuditLogsByEntityId(entityId: string): Promise<AuditLogDto[]> {
    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        entityId,
        companyId: this.user.companyId,
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
