import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { DateBucket } from "@/core/base/grouping/grouping.schema";
import type { GroupCountRow } from "@/core/base/grouping/group-count";
import type { GroupableFieldSpec } from "@/core/base/grouping/groupable-field";
import type { OperatorAuditRowDto } from "./operator-lists.schema";
import type { GetOperatorAuditLogsRepo } from "./get/get-operator-audit-logs.interactor";

import type { Prisma } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { dateGroupables, enumGroupables } from "@/core/base/grouping/groupable-field";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";

import { OPERATOR_AUDIT_SOURCE } from "./operator-lists.schema";
import { OPERATOR_AUDIT_ACTION } from "./operator.schema";
import {
  applyGroupScopeAsFilters,
  countOperatorGroups,
  operatorCollator,
  planOperatorAuditFilters,
  resolveWorkspaceLabels,
} from "./operator-list-filters";

const OPERATOR_READ_ACTIONS: string[] = [
  OPERATOR_AUDIT_ACTION.overviewRead,
  OPERATOR_AUDIT_ACTION.candidateRead,
  OPERATOR_AUDIT_ACTION.companyRead,
  OPERATOR_AUDIT_ACTION.auditRead,
  OPERATOR_AUDIT_ACTION.userListRead,
  OPERATOR_AUDIT_ACTION.userSummaryRead,
  OPERATOR_AUDIT_ACTION.userDetailRead,
];

const AUDIT_MAX_SKIP = 10_000;

export class PrismaOperatorAuditRepo extends BaseRepository implements GetOperatorAuditLogsRepo {
  getSortableFields() {
    return [{ field: "createdAt", resolvedFields: ["createdAt"] }];
  }

  getFilterableFields() {
    return Promise.resolve(
      [FilterFieldKey.auditSource, FilterFieldKey.workspaceId, FilterFieldKey.createdAt].map((field) => ({
        field,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[field],
      })),
    );
  }

  getGroupableFields(): Promise<GroupableFieldSpec[]> {
    return Promise.resolve([
      ...enumGroupables("operatorAudit", { auditSource: true }),
      ...dateGroupables("operatorAudit", { createdAt: true, updatedAt: false }),
    ]);
  }

  collator() {
    return operatorCollator();
  }

  countByGroup(args: {
    spec: GroupableFieldSpec;
    params: GetQueryParams;
    bucket?: DateBucket;
    now?: string;
  }): Promise<GroupCountRow[]> {
    return countOperatorGroups(args.spec, args.bucket, args.now, (groupScope) =>
      this.countAuditUnscoped({ ...args.params, groupScope }),
    );
  }

  private plan(params: GetQueryParams) {
    const { sources, workspaceIds, createdAt } = planOperatorAuditFilters(params.filters);
    const take = params.take ?? params.pagination?.pageSize ?? 25;
    const page = params.pagination?.page ?? 1;
    const skip = Math.max(params.skip ?? (page - 1) * take, 0);
    const beyondWindow = skip > AUDIT_MAX_SKIP;
    const search = params.searchTerm?.trim() ?? "";

    return { sources, workspaceIds, createdAt, take, skip, search, beyondWindow };
  }

  private productWhere(plan: ReturnType<PrismaOperatorAuditRepo["plan"]>): Prisma.AuditLogWhereInput {
    return {
      ...(plan.workspaceIds ? { companyId: { in: plan.workspaceIds } } : {}),
      ...(plan.createdAt.length > 0 ? { AND: plan.createdAt.map((createdAt) => ({ createdAt })) } : {}),
      ...(plan.search ? { event: { contains: plan.search, mode: "insensitive" as const } } : {}),
    };
  }

  private operatorWhere(plan: ReturnType<PrismaOperatorAuditRepo["plan"]>): Prisma.OperatorAuditEventWhereInput {
    return {
      ...(plan.workspaceIds ? { targetCompanyId: { in: plan.workspaceIds } } : {}),
      ...(plan.createdAt.length > 0 ? { AND: plan.createdAt.map((createdAt) => ({ createdAt })) } : {}),
      action: {
        notIn: OPERATOR_READ_ACTIONS,
        ...(plan.search ? { contains: plan.search, mode: "insensitive" as const } : {}),
      },
    };
  }

  async getItems(params: GetQueryParams): Promise<OperatorAuditRowDto[]> {
    return this.listAuditUnscoped(params);
  }

  async getCount(params: GetQueryParams): Promise<number> {
    return this.countAuditUnscoped(params);
  }

  @BypassTenantGuard
  private async listAuditUnscoped(scoped: GetQueryParams): Promise<OperatorAuditRowDto[]> {
    const params = applyGroupScopeAsFilters(scoped);
    if (!params) return [];

    const plan = this.plan(params);
    if (plan.sources.length === 0) return [];
    if (plan.beyondWindow) return [];

    const ascending = params.sortDescriptor?.direction === "asc";
    const order = ascending ? "asc" : "desc";
    const window = plan.skip + plan.take;
    const includeProduct = plan.sources.includes(OPERATOR_AUDIT_SOURCE.product);
    const includeOperator = plan.sources.includes(OPERATOR_AUDIT_SOURCE.operator);

    const [productRows, operatorRows] = await Promise.all([
      includeProduct
        ? this.prisma.auditLog.findMany({
            where: this.productWhere(plan),
            orderBy: [{ createdAt: order }, { id: order }],
            take: window,
            select: {
              id: true,
              event: true,
              userId: true,
              companyId: true,
              entityId: true,
              createdAt: true,
              user: { select: { email: true } },
            },
          })
        : Promise.resolve([]),
      includeOperator
        ? this.prisma.operatorAuditEvent.findMany({
            where: this.operatorWhere(plan),
            orderBy: [{ createdAt: order }, { id: order }],
            take: window,
            select: {
              id: true,
              action: true,
              actorUserId: true,
              targetCompanyId: true,
              targetUserId: true,
              reason: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const actorIds = [...new Set(operatorRows.map((row) => row.actorUserId))];
    const actors = await this.actorEmailsUnscoped(actorIds);

    const merged: OperatorAuditRowDto[] = [
      ...productRows.map((row) => ({
        id: row.id,
        source: OPERATOR_AUDIT_SOURCE.product,
        action: row.event,
        actorLabel: row.user?.email ?? null,
        actorUserId: row.userId,
        workspaceId: row.companyId,
        workspaceLabel: null,
        targetId: row.entityId,
        reason: null,
        createdAt: row.createdAt,
      })),
      ...operatorRows.map((row) => ({
        id: row.id,
        source: OPERATOR_AUDIT_SOURCE.operator,
        action: row.action,
        actorLabel: actors.get(row.actorUserId) ?? null,
        actorUserId: row.actorUserId,
        workspaceId: row.targetCompanyId,
        workspaceLabel: null,
        targetId: row.targetUserId,
        reason: row.reason,
        createdAt: row.createdAt,
      })),
    ];

    merged.sort((left, right) => {
      const byTime = right.createdAt.getTime() - left.createdAt.getTime();
      const delta = byTime !== 0 ? byTime : right.id < left.id ? -1 : right.id > left.id ? 1 : 0;

      return ascending ? -delta : delta;
    });

    const page = merged.slice(plan.skip, plan.skip + plan.take);
    const workspaceIds = [...new Set(page.flatMap((row) => (row.workspaceId ? [row.workspaceId] : [])))];
    const labels = await resolveWorkspaceLabels(this.prisma, workspaceIds);

    return page.map((row) => ({
      ...row,
      workspaceLabel: row.workspaceId ? (labels.get(row.workspaceId) ?? row.workspaceId.slice(0, 8)) : null,
    }));
  }

  @BypassTenantGuard
  private async countAuditUnscoped(scoped: GetQueryParams): Promise<number> {
    const params = applyGroupScopeAsFilters(scoped);
    if (!params) return 0;

    const plan = this.plan(params);
    if (plan.sources.length === 0) return 0;

    const [product, operator] = await Promise.all([
      plan.sources.includes(OPERATOR_AUDIT_SOURCE.product)
        ? this.prisma.auditLog.count({ where: this.productWhere(plan) })
        : Promise.resolve(0),
      plan.sources.includes(OPERATOR_AUDIT_SOURCE.operator)
        ? this.prisma.operatorAuditEvent.count({ where: this.operatorWhere(plan) })
        : Promise.resolve(0),
    ]);

    return Math.min(product + operator, AUDIT_MAX_SKIP + plan.take);
  }

  @BypassTenantGuard
  private async actorEmailsUnscoped(userIds: string[]): Promise<Map<string, string>> {
    const emails = new Map<string, string>();
    if (userIds.length === 0) return emails;

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true },
    });
    for (const user of users) emails.set(user.id, user.email);

    return emails;
  }
}
