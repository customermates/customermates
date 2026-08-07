import type { DomainEventMap } from "@/features/event/domain-events";
import type { CreateAuditLogRepo } from "@/features/event/event.service";
import type { RepoArgs } from "@/core/utils/types";
import type { LegalAuditRepo } from "@/features/legal/get-legal-status.interactor";
import type { GetAuditLogsRepo } from "./get/get-audit-logs.interactor";

import type { Prisma } from "@/generated/prisma";

import { transactionStorage } from "@/core/decorators/transaction-context";
import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { type GetQueryParams } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { DomainEvent } from "@/features/event/domain-events";

export class PrismaAuditLogRepo
  extends BaseRepository<Prisma.AuditLogWhereInput>
  implements GetAuditLogsRepo, CreateAuditLogRepo, LegalAuditRepo
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
      {
        field: FilterFieldKey.event,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.event],
      },
      {
        field: FilterFieldKey.createdAt,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.createdAt],
      },
    ]);
  }

  async getItems(params: GetQueryParams) {
    const args = await this.buildQueryArgs(params, {
      companyId: this.companyId,
    });

    const auditLogs = await this.prisma.auditLog.findMany({
      ...args,
      select: this.baseSelect,
    });

    return auditLogs.map((log) => ({
      ...log,
      event: log.event as DomainEvent,
      eventData: log.eventData as DomainEventMap[DomainEvent],
    }));
  }

  async getCount(params: GetQueryParams) {
    const { where } = await this.buildQueryArgs(params, {
      companyId: this.companyId,
    });

    return this.prisma.auditLog.count({ where });
  }

  async log(args: RepoArgs<CreateAuditLogRepo, "log">) {
    const { id: userId, companyId } = this.user;

    const data = {
      ...args,
      eventData: args.eventData as Prisma.InputJsonValue,
      userId,
      companyId,
    };

    const store = transactionStorage.getStore();

    if (store) {
      store.auditLogBatch.push(data);
      return;
    }

    await this.prisma.auditLog.create({ data });
  }

  @BypassTenantGuard
  async logUnscoped(args: RepoArgs<CreateAuditLogRepo, "logUnscoped">) {
    const data = {
      ...args,
      eventData: args.eventData as Prisma.InputJsonValue,
    };
    const store = transactionStorage.getStore();
    if (store) {
      store.auditLogBatch.push(data);
      return;
    }
    await this.prisma.auditLog.create({ data });
  }

  @BypassTenantGuard
  async findLegalEventsUnscoped(companyId: string) {
    const records = await this.prisma.auditLog.findMany({
      where: {
        companyId,
        event: { in: [DomainEvent.LEGAL_NOTICE_SENT, DomainEvent.LEGAL_DOCUMENTS_ACCEPTED] },
      },
      orderBy: { createdAt: "asc" },
      select: {
        createdAt: true,
        entityId: true,
        event: true,
        eventData: true,
        userId: true,
      },
    });

    return records.map((record) => ({ ...record, event: record.event as DomainEvent }));
  }
}
