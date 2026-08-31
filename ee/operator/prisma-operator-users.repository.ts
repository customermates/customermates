import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { OperatorUserRowDto } from "./operator-lists.schema";
import type { GetOperatorUsersRepo } from "./get/get-operator-users.interactor";

import type { Prisma } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";

import { partitionOperatorUserFilters } from "./operator-list-filters";

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
