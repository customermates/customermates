import type { DomainEventMap } from "@/features/event/domain-events";
import type { GetAuditLogsRepo } from "./get/get-audit-logs.interactor";
import type { CreateAuditLogRepo } from "@/features/event/event.service";
import type { DomainEvent } from "@/features/event/domain-events";
import type { RepoArgs } from "@/core/utils/types";
import type { LegalAuditRepo } from "@/features/legal/legal-status.service";

import type { Prisma } from "@/generated/prisma";

import { transactionStorage } from "@/core/decorators/transaction-context";
import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { type GetQueryParams } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";

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
  async findLegalEventUnscoped(args: {
    companyId: string;
    event: DomainEvent;
    entityId?: string;
    excludeEntityId?: string;
    userId?: string;
    order?: "asc" | "desc";
  }) {
    return this.prisma.auditLog.findFirst({
      where: {
        companyId: args.companyId,
        event: args.event,
        entityId: args.entityId ?? (args.excludeEntityId ? { not: args.excludeEntityId } : undefined),
        userId: args.userId,
      },
      orderBy: { createdAt: args.order ?? "desc" },
      select: {
        createdAt: true,
        entityId: true,
        eventData: true,
        userId: true,
      },
    });
  }

  @BypassTenantGuard
  async findLegalEventsUnscoped(args: { companyId: string; event: DomainEvent; entityId: string; userId?: string }) {
    return this.prisma.auditLog.findMany({
      where: {
        companyId: args.companyId,
        event: args.event,
        entityId: args.entityId,
        userId: args.userId,
      },
      orderBy: { createdAt: "asc" },
      select: {
        createdAt: true,
        entityId: true,
        eventData: true,
        userId: true,
      },
    });
  }
}
