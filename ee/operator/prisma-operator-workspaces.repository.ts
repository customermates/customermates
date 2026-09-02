import type { Filter, GetQueryParams } from "@/core/base/base-get.schema";
import type { OperatorWorkspaceRowDto } from "./operator-lists.schema";
import type { GetOperatorWorkspacesRepo } from "./get/get-operator-workspaces.interactor";

import type { Prisma } from "@/generated/prisma";
import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";

import { workspaceAgentCreditRate } from "@/ee/agent-chat/agent-credit-policy";

import { filterValues, negated } from "./operator-list-filters";

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
  let hasPositiveSubscriptionCondition = false;

  for (const filter of filters ?? []) {
    if (filter.field === String(FilterFieldKey.workspaceId)) {
      const values = filterValues(filter);
      if (values.length > 0) baseWhere.id = negated(filter) ? { notIn: values } : { in: values };
      continue;
    }

    if (filter.field === String(FilterFieldKey.adProvider)) {
      const values = filterValues(filter);
      if (values.length > 0) {
        baseWhere.adAttributions = negated(filter)
          ? { none: { provider: { in: values } } }
          : { some: { provider: { in: values } } };
      }
      continue;
    }

    if (filter.field === String(FilterFieldKey.workspaceTags)) {
      const values = filterValues(filter);
      if (values.length > 0) {
        if (negated(filter)) baseWhere.NOT = { tags: { hasSome: values } };
        else baseWhere.tags = { hasSome: values };
      }
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
      if (plans.length > 0) {
        subscription.plan = negated(filter) ? { notIn: plans } : { in: plans };
        if (!negated(filter)) hasPositiveSubscriptionCondition = true;
      }
      continue;
    }

    const statuses = values.filter((value): value is SubscriptionStatus =>
      Object.values(SubscriptionStatus).includes(value as SubscriptionStatus),
    );
    if (statuses.length > 0) {
      subscription.status = negated(filter) ? { notIn: statuses } : { in: statuses };
      if (!negated(filter)) hasPositiveSubscriptionCondition = true;
    }
  }

  if (Object.keys(subscription).length > 0) {
    if (hasPositiveSubscriptionCondition) baseWhere.subscription = { is: subscription };
    else baseWhere.OR = [{ subscription: { is: subscription } }, { subscription: { is: null } }];
  }

  return { baseWhere, passthrough };
}

export class PrismaOperatorWorkspacesRepo
  extends BaseRepository<Prisma.CompanyWhereInput>
  implements GetOperatorWorkspacesRepo
{
  getSearchableFields() {
    return [{ field: "users.email" }];
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
        FilterFieldKey.adProvider,
        FilterFieldKey.workspaceTags,
      ].map((field) => ({ field, operators: FILTER_FIELD_DEFAULT_OPERATORS[field] })),
    );
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
          WHERE owner_user."companyId" = c."id"
          ORDER BY
            (owner_user."status"::text = 'active') DESC,
            (owner_role."isSystemRole" IS TRUE) DESC,
            owner_user."createdAt" ASC
          LIMIT 1
        ) AS "owner",
        (
          SELECT owner_user."id"::text
          FROM "User" AS owner_user
          LEFT JOIN "UserRole" AS owner_role ON owner_role."id" = owner_user."roleId"
          WHERE owner_user."companyId" = c."id"
          ORDER BY
            (owner_user."status"::text = 'active') DESC,
            (owner_role."isSystemRole" IS TRUE) DESC,
            owner_user."createdAt" ASC
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
    const args = await this.buildQueryArgs({ ...params, filters: passthrough }, baseWhere);

    const companies = await this.prisma.company.findMany({
      ...args,
      select: {
        id: true,
        createdAt: true,
        tags: true,
        subscription: {
          select: {
            plan: true,
            status: true,
            quantity: true,
            enterpriseAgentCreditsPerUser: true,
            trialEndDate: true,
            lemonSqueezyId: true,
            updatedAt: true,
          },
        },
        adAttributions: { select: { provider: true }, orderBy: { clickedAt: "desc" }, take: 1 },
      },
    });

    const aggregates = await this.aggregatesUnscoped(companies.map((company) => company.id));
    const now = new Date();

    return companies.map((company) => {
      const aggregate = aggregates.get(company.id);
      const subscription = company.subscription;

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
        creditsPerUser: subscription
          ? workspaceAgentCreditRate({
              plan: subscription.plan,
              status: subscription.status,
              trialEndDate: subscription.trialEndDate,
              enterpriseCreditsPerUser: subscription.enterpriseAgentCreditsPerUser,
              now,
            })
          : null,
        trialEndDate: company.subscription?.trialEndDate ?? null,
        lemonSqueezyId: company.subscription?.lemonSqueezyId ?? null,
        subscriptionUpdatedAt: company.subscription?.updatedAt ?? null,
        adProvider: company.adAttributions[0]?.provider ?? null,
        tags: company.tags,
        createdAt: company.createdAt,
      };
    });
  }

  @BypassTenantGuard
  private async countWorkspacesUnscoped(params: GetQueryParams): Promise<number> {
    const { baseWhere, passthrough } = partitionOperatorWorkspaceFilters(params.filters);
    const { where } = await this.buildQueryArgs({ ...params, filters: passthrough }, baseWhere);

    return this.prisma.company.count({ where });
  }
}
