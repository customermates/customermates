import type { Filter, GetQueryParams } from "@/core/base/base-get.schema";
import type {
  OperatorAuditRowDto,
  OperatorAuditSource,
  OperatorRiskSummaryDto,
  OperatorUserRowDto,
  OperatorWorkspaceRowDto,
} from "./operator-lists.schema";
import type { GetOperatorUsersRepo } from "./get/get-operator-users.interactor";
import type { GetOperatorWorkspacesRepo } from "./get/get-operator-workspaces.interactor";
import type { GetOperatorAuditRepo } from "./get/get-operator-audit.interactor";

import type { Prisma } from "@/generated/prisma";
import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";

import { OPERATOR_AUDIT_SOURCE } from "./operator-lists.schema";
import { OPERATOR_AUDIT_ACTION } from "./operator.schema";

import { SubscriptionStatus as SubscriptionStatusEnum } from "@/generated/prisma";

const INTERCEPTED_FIELDS = new Set<string>([
  FilterFieldKey.plan,
  FilterFieldKey.subscriptionStatus,
  FilterFieldKey.isPlatformOperator,
  FilterFieldKey.workspaceId,
]);

function filterValues(filter: Filter): string[] {
  const value = (filter as { value?: unknown }).value;
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
  return typeof value === "string" ? [value] : [];
}

function negated(filter: Filter): boolean {
  return filter.operator === FilterOperatorKey.notIn;
}

export function partitionOperatorUserFilters(filters: Filter[] | undefined): {
  baseWhere: Prisma.UserWhereInput;
  passthrough: Filter[];
} {
  const passthrough: Filter[] = [];
  const subscription: Prisma.SubscriptionWhereInput = {};
  const baseWhere: Prisma.UserWhereInput = {};

  for (const filter of filters ?? []) {
    if (!INTERCEPTED_FIELDS.has(filter.field)) {
      passthrough.push(filter);
      continue;
    }

    const values = filterValues(filter);
    if (values.length === 0) continue;

    if (filter.field === String(FilterFieldKey.isPlatformOperator)) {
      const wanted = values.includes("true");
      const both = values.includes("true") && values.includes("false");
      if (both) continue;
      baseWhere.isPlatformOperator = negated(filter) ? !wanted : wanted;
      continue;
    }

    if (filter.field === String(FilterFieldKey.workspaceId)) {
      baseWhere.companyId = negated(filter) ? { notIn: values } : { in: values };
      continue;
    }

    if (filter.field === String(FilterFieldKey.plan)) {
      const plans = values.filter((value): value is SubscriptionPlan =>
        Object.values(SubscriptionPlan).includes(value as SubscriptionPlan),
      );
      if (plans.length > 0) subscription.plan = negated(filter) ? { notIn: plans } : { in: plans };
      continue;
    }

    const statuses = values.filter((value): value is SubscriptionStatus =>
      Object.values(SubscriptionStatus).includes(value as SubscriptionStatus),
    );
    if (statuses.length > 0) subscription.status = negated(filter) ? { notIn: statuses } : { in: statuses };
  }

  if (Object.keys(subscription).length > 0) baseWhere.company = { subscription: { is: subscription } };

  return { baseWhere, passthrough };
}

export class PrismaOperatorUsersRepo extends BaseRepository<Prisma.UserWhereInput> implements GetOperatorUsersRepo {
  getSearchableFields() {
    return [{ field: "email" }, { field: "firstName" }, { field: "lastName" }];
  }

  getSortableFields() {
    return [
      { field: "createdAt", resolvedFields: ["createdAt"] },
      { field: "lastActiveAt", resolvedFields: ["lastActiveAt"] },
      { field: "email", resolvedFields: ["email"] },
      { field: "status", resolvedFields: ["status"] },
    ];
  }

  getFilterableFields() {
    return Promise.resolve(
      [
        FilterFieldKey.status,
        FilterFieldKey.plan,
        FilterFieldKey.subscriptionStatus,
        FilterFieldKey.isPlatformOperator,
        FilterFieldKey.lastActiveAt,
        FilterFieldKey.createdAt,
        FilterFieldKey.workspaceId,
      ].map((field) => ({ field, operators: FILTER_FIELD_DEFAULT_OPERATORS[field] })),
    );
  }

  getCustomColumns() {
    return Promise.resolve([]);
  }

  @BypassTenantGuard
  async resolveWorkspaceLabelsUnscoped(companyIds: string[]): Promise<Map<string, string>> {
    const labels = new Map<string, string>();
    if (companyIds.length === 0) return labels;

    const rows = await this.prisma.$queryRaw<Array<{ companyId: string; domain: string | null; total: bigint }>>`
      SELECT "companyId", split_part("email", '@', 2) AS domain, COUNT(*)::bigint AS total
      FROM "User"
      WHERE "companyId" = ANY(${companyIds}::text[])
      GROUP BY 1, 2
      ORDER BY "companyId" ASC, total DESC, domain ASC
    `;

    for (const row of rows) {
      if (labels.has(row.companyId) || !row.domain) continue;
      labels.set(row.companyId, row.domain);
    }

    return labels;
  }

  async getItems(params: GetQueryParams): Promise<OperatorUserRowDto[]> {
    return this.listRowsUnscoped(params);
  }

  async getCount(params: GetQueryParams): Promise<number> {
    return this.countRowsUnscoped(params);
  }

  @BypassTenantGuard
  private async listRowsUnscoped(params: GetQueryParams): Promise<OperatorUserRowDto[]> {
    const { baseWhere, passthrough } = partitionOperatorUserFilters(params.filters);
    const args = await this.buildQueryArgs({ ...params, filters: passthrough }, baseWhere);

    const users = await this.prisma.user.findMany({
      where: args.where,
      orderBy: args.orderBy,
      skip: args.skip,
      take: args.take,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        isPlatformOperator: true,
        lastActiveAt: true,
        createdAt: true,
        updatedAt: true,
        companyId: true,
        company: {
          select: { subscription: { select: { plan: true, status: true, quantity: true, updatedAt: true } } },
        },
      },
    });

    const labels = await this.resolveWorkspaceLabelsUnscoped([...new Set(users.map((user) => user.companyId))]);

    return users.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      status: user.status,
      isPlatformOperator: user.isPlatformOperator,
      lastActiveAt: user.lastActiveAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      companyId: user.companyId,
      workspaceLabel: labels.get(user.companyId) ?? user.companyId.slice(0, 8),
      plan: user.company.subscription?.plan ?? null,
      subscriptionStatus: user.company.subscription?.status ?? null,
      subscriptionQuantity: user.company.subscription?.quantity ?? null,
      subscriptionUpdatedAt: user.company.subscription?.updatedAt ?? null,
    }));
  }

  @BypassTenantGuard
  private async countRowsUnscoped(params: GetQueryParams): Promise<number> {
    const { baseWhere, passthrough } = partitionOperatorUserFilters(params.filters);
    const { where } = await this.buildQueryArgs({ ...params, filters: passthrough }, baseWhere);

    return this.prisma.user.count({ where });
  }
}

type WorkspaceAggregate = {
  companyId: string;
  total: number;
  active: number;
  domain: string | null;
  owner: string | null;
  ownerId: string | null;
};

export function partitionOperatorWorkspaceFilters(filters: Filter[] | undefined): {
  baseWhere: Prisma.CompanyWhereInput;
  passthrough: Filter[];
} {
  const passthrough: Filter[] = [];
  const subscription: Prisma.SubscriptionWhereInput = {};
  const baseWhere: Prisma.CompanyWhereInput = {};

  for (const filter of filters ?? []) {
    if (filter.field === String(FilterFieldKey.workspaceId)) {
      const values = filterValues(filter);
      if (values.length > 0) baseWhere.id = negated(filter) ? { notIn: values } : { in: values };
      continue;
    }

    if (filter.field !== String(FilterFieldKey.plan) && filter.field !== String(FilterFieldKey.subscriptionStatus)) {
      passthrough.push(filter);
      continue;
    }

    const values = filterValues(filter);
    if (values.length === 0) continue;

    if (filter.field === String(FilterFieldKey.plan)) {
      const plans = values.filter((value): value is SubscriptionPlan =>
        Object.values(SubscriptionPlan).includes(value as SubscriptionPlan),
      );
      if (plans.length > 0) subscription.plan = negated(filter) ? { notIn: plans } : { in: plans };
      continue;
    }

    const statuses = values.filter((value): value is SubscriptionStatus =>
      Object.values(SubscriptionStatus).includes(value as SubscriptionStatus),
    );
    if (statuses.length > 0) subscription.status = negated(filter) ? { notIn: statuses } : { in: statuses };
  }

  if (Object.keys(subscription).length > 0) baseWhere.subscription = { is: subscription };

  return { baseWhere, passthrough };
}

export class PrismaOperatorWorkspacesRepo
  extends BaseRepository<Prisma.CompanyWhereInput>
  implements GetOperatorWorkspacesRepo
{
  getSearchableFields() {
    return [];
  }

  getSortableFields() {
    return [{ field: "createdAt", resolvedFields: ["createdAt"] }];
  }

  getFilterableFields() {
    return Promise.resolve(
      [
        FilterFieldKey.plan,
        FilterFieldKey.subscriptionStatus,
        FilterFieldKey.createdAt,
        FilterFieldKey.workspaceId,
      ].map((field) => ({ field, operators: FILTER_FIELD_DEFAULT_OPERATORS[field] })),
    );
  }

  getCustomColumns() {
    return Promise.resolve([]);
  }

  private searchClause(searchTerm: string | undefined): Prisma.CompanyWhereInput {
    const term = searchTerm?.trim();
    if (!term) return {};

    return { users: { some: { email: { contains: term, mode: "insensitive" } } } };
  }

  @BypassTenantGuard
  private async aggregatesUnscoped(companyIds: string[]): Promise<Map<string, WorkspaceAggregate>> {
    const aggregates = new Map<string, WorkspaceAggregate>();
    if (companyIds.length === 0) return aggregates;

    const rows = await this.prisma.$queryRaw<WorkspaceAggregate[]>`
      SELECT
        c."id" AS "companyId",
        COUNT(u."id")::int AS "total",
        COUNT(u."id") FILTER (WHERE u."status"::text = 'active')::int AS "active",
        (
          SELECT split_part(inner_user."email", '@', 2)
          FROM "User" AS inner_user
          WHERE inner_user."companyId" = c."id"
          GROUP BY 1
          ORDER BY COUNT(*) DESC, 1 ASC
          LIMIT 1
        ) AS "domain",
        (
          SELECT owner_user."email"
          FROM "User" AS owner_user
          LEFT JOIN "UserRole" AS owner_role ON owner_role."id" = owner_user."roleId"
          WHERE owner_user."companyId" = c."id" AND owner_user."status"::text = 'active'
          ORDER BY (owner_role."isSystemRole" IS TRUE) DESC, owner_user."createdAt" ASC
          LIMIT 1
        ) AS "owner",
        (
          SELECT owner_user."id"::text
          FROM "User" AS owner_user
          LEFT JOIN "UserRole" AS owner_role ON owner_role."id" = owner_user."roleId"
          WHERE owner_user."companyId" = c."id" AND owner_user."status"::text = 'active'
          ORDER BY (owner_role."isSystemRole" IS TRUE) DESC, owner_user."createdAt" ASC
          LIMIT 1
        ) AS "ownerId"
      FROM "Company" AS c
      LEFT JOIN "User" AS u ON u."companyId" = c."id"
      WHERE c."id" = ANY(${companyIds}::text[])
      GROUP BY c."id"
    `;

    for (const row of rows) aggregates.set(row.companyId, row);

    return aggregates;
  }

  async getItems(params: GetQueryParams): Promise<OperatorWorkspaceRowDto[]> {
    return this.listWorkspacesUnscoped(params);
  }

  async getCount(params: GetQueryParams): Promise<number> {
    return this.countWorkspacesUnscoped(params);
  }

  @BypassTenantGuard
  private async listWorkspacesUnscoped(params: GetQueryParams): Promise<OperatorWorkspaceRowDto[]> {
    const { baseWhere, passthrough } = partitionOperatorWorkspaceFilters(params.filters);
    const args = await this.buildQueryArgs(
      { ...params, filters: passthrough, searchTerm: undefined },
      { ...baseWhere, ...this.searchClause(params.searchTerm) },
    );

    const companies = await this.prisma.company.findMany({
      where: args.where,
      orderBy: args.orderBy,
      skip: args.skip,
      take: args.take,
      select: {
        id: true,
        createdAt: true,
        subscription: {
          select: { plan: true, status: true, quantity: true, enterpriseAgentCreditsPerUser: true, updatedAt: true },
        },
      },
    });

    const aggregates = await this.aggregatesUnscoped(companies.map((company) => company.id));

    return companies.map((company) => {
      const aggregate = aggregates.get(company.id);

      return {
        id: company.id,
        workspaceLabel: aggregate?.domain ?? company.id.slice(0, 8),
        ownerEmail: aggregate?.owner ?? null,
        ownerUserId: aggregate?.ownerId ?? null,
        userCount: aggregate?.total ?? 0,
        activeUserCount: aggregate?.active ?? 0,
        plan: company.subscription?.plan ?? null,
        subscriptionStatus: company.subscription?.status ?? null,
        seats: company.subscription?.quantity ?? null,
        enterpriseCreditsPerUser: company.subscription?.enterpriseAgentCreditsPerUser ?? null,
        subscriptionUpdatedAt: company.subscription?.updatedAt ?? null,
        createdAt: company.createdAt,
      };
    });
  }

  @BypassTenantGuard
  private async countWorkspacesUnscoped(params: GetQueryParams): Promise<number> {
    const { baseWhere, passthrough } = partitionOperatorWorkspaceFilters(params.filters);
    const { where } = await this.buildQueryArgs(
      { ...params, filters: passthrough, searchTerm: undefined },
      { ...baseWhere, ...this.searchClause(params.searchTerm) },
    );

    return this.prisma.company.count({ where });
  }
}

function dateBound(filter: Filter): { gte?: Date; lte?: Date } {
  const raw = (filter as { value?: unknown }).value;
  const toDate = (value: unknown) => (typeof value === "string" || value instanceof Date ? new Date(value) : undefined);

  if (filter.operator === FilterOperatorKey.inLastDays) {
    const days = Number(raw);
    if (!Number.isFinite(days) || days <= 0) return {};

    return { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
  }

  if (filter.operator === FilterOperatorKey.between && Array.isArray(raw))
    return { gte: toDate(raw[0]), lte: toDate(raw[1]) };
  if (filter.operator === FilterOperatorKey.gt || filter.operator === FilterOperatorKey.gte)
    return { gte: toDate(raw) };
  if (filter.operator === FilterOperatorKey.lt || filter.operator === FilterOperatorKey.lte)
    return { lte: toDate(raw) };

  return {};
}

const OPERATOR_READ_ACTIONS: string[] = [
  OPERATOR_AUDIT_ACTION.overviewRead,
  OPERATOR_AUDIT_ACTION.candidateRead,
  OPERATOR_AUDIT_ACTION.companyRead,
  OPERATOR_AUDIT_ACTION.auditRead,
  OPERATOR_AUDIT_ACTION.userListRead,
  OPERATOR_AUDIT_ACTION.userSummaryRead,
  OPERATOR_AUDIT_ACTION.userDetailRead,
];

export class PrismaOperatorAuditRepo
  extends BaseRepository<Prisma.OperatorAuditEventWhereInput>
  implements GetOperatorAuditRepo
{
  getSearchableFields() {
    return [];
  }

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

  getCustomColumns() {
    return Promise.resolve([]);
  }

  private plan(params: GetQueryParams) {
    let sources: OperatorAuditSource[] = [OPERATOR_AUDIT_SOURCE.product, OPERATOR_AUDIT_SOURCE.operator];
    let workspaceIds: string[] | null = null;
    let from: Date | undefined;
    let to: Date | undefined;

    for (const filter of params.filters ?? []) {
      if (filter.field === String(FilterFieldKey.auditSource)) {
        const values = filterValues(filter).filter(
          (value): value is OperatorAuditSource =>
            value === OPERATOR_AUDIT_SOURCE.product || value === OPERATOR_AUDIT_SOURCE.operator,
        );
        if (values.length === 0) continue;
        sources = negated(filter) ? sources.filter((source) => !values.includes(source)) : values;
        continue;
      }

      if (filter.field === String(FilterFieldKey.workspaceId)) {
        const values = filterValues(filter);
        if (values.length > 0 && !negated(filter)) workspaceIds = values;
        continue;
      }

      if (filter.field === String(FilterFieldKey.createdAt)) {
        const bound = dateBound(filter);
        from = bound.gte ?? from;
        to = bound.lte ?? to;
      }
    }

    const take = params.take ?? params.pagination?.pageSize ?? 25;
    const page = params.pagination?.page ?? 1;
    const skip = params.skip ?? (page - 1) * take;
    const search = params.searchTerm?.trim() ?? "";

    return { sources, workspaceIds, from, to, take, skip, search };
  }

  private createdAtRange(plan: ReturnType<PrismaOperatorAuditRepo["plan"]>) {
    if (!plan.from && !plan.to) return undefined;

    return { ...(plan.from ? { gte: plan.from } : {}), ...(plan.to ? { lte: plan.to } : {}) };
  }

  private productWhere(plan: ReturnType<PrismaOperatorAuditRepo["plan"]>): Prisma.AuditLogWhereInput {
    const createdAt = this.createdAtRange(plan);

    return {
      ...(plan.workspaceIds ? { companyId: { in: plan.workspaceIds } } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(plan.search ? { event: { contains: plan.search, mode: "insensitive" as const } } : {}),
    };
  }

  private operatorWhere(plan: ReturnType<PrismaOperatorAuditRepo["plan"]>): Prisma.OperatorAuditEventWhereInput {
    const createdAt = this.createdAtRange(plan);

    return {
      ...(plan.workspaceIds ? { targetCompanyId: { in: plan.workspaceIds } } : {}),
      ...(createdAt ? { createdAt } : {}),
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
  private async listAuditUnscoped(params: GetQueryParams): Promise<OperatorAuditRowDto[]> {
    const plan = this.plan(params);
    if (plan.sources.length === 0) return [];

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
    const labels = await this.dominantDomainsUnscoped(workspaceIds);

    return page.map((row) => ({
      ...row,
      workspaceLabel: row.workspaceId ? (labels.get(row.workspaceId) ?? row.workspaceId.slice(0, 8)) : null,
    }));
  }

  @BypassTenantGuard
  private async countAuditUnscoped(params: GetQueryParams): Promise<number> {
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

    return product + operator;
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

  @BypassTenantGuard
  private async dominantDomainsUnscoped(companyIds: string[]): Promise<Map<string, string>> {
    const labels = new Map<string, string>();
    if (companyIds.length === 0) return labels;

    const users = await this.prisma.user.findMany({
      where: { companyId: { in: companyIds } },
      select: { companyId: true, email: true },
      take: 2000,
    });

    const counts = new Map<string, Map<string, number>>();
    for (const user of users) {
      const domain = user.email.split("@")[1];
      if (!domain) continue;
      const perCompany = counts.get(user.companyId) ?? new Map<string, number>();
      perCompany.set(domain, (perCompany.get(domain) ?? 0) + 1);
      counts.set(user.companyId, perCompany);
    }

    for (const [companyId, perCompany] of counts) {
      const best = [...perCompany.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0];
      if (best) labels.set(companyId, best[0]);
    }

    return labels;
  }
}

export class PrismaOperatorRiskSummaryRepo extends BaseRepository<Prisma.CompanyWhereInput> {
  @BypassTenantGuard
  async getRiskSummaryUnscoped(now = new Date()): Promise<OperatorRiskSummaryDto> {
    const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [pastDue, unpaid, expired, trialsEnding, activeUsers, newWorkspaces, newUsers] = await Promise.all([
      this.prisma.subscription.count({ where: { status: SubscriptionStatusEnum.pastDue } }),
      this.prisma.subscription.count({ where: { status: SubscriptionStatusEnum.unPaid } }),
      this.prisma.subscription.count({ where: { status: SubscriptionStatusEnum.expired } }),
      this.prisma.subscription.count({
        where: { status: SubscriptionStatusEnum.trial, trialEndDate: { gte: now, lte: sevenDaysAhead } },
      }),
      this.prisma.user.count({ where: { lastActiveAt: { gte: sevenDaysAgo } } }),
      this.prisma.company.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    ]);

    return {
      subscriptionsPastDue: pastDue,
      subscriptionsUnpaid: unpaid,
      subscriptionsExpired: expired,
      trialsEndingWithinSevenDays: trialsEnding,
      activeUsersLastSevenDays: activeUsers,
      newWorkspacesLastThirtyDays: newWorkspaces,
      newUsersLastThirtyDays: newUsers,
    };
  }
}
