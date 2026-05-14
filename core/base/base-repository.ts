import type { ExtendedUser } from "@/features/user/user.types";
import type { GetQueryParams } from "@/core/base/base-get.schema";

import { Resource, Action } from "@/generated/prisma";

import type { Prisma, EntityType } from "@/generated/prisma";

import { getTransactionClient } from "../decorators/transaction-context";
import { isTenantGuardBypassed, getTenantUser } from "../decorators/tenant-context";

import { BaseQueryBuilder, compareCustomFieldValues } from "@/core/base/base-query-builder";
import { prisma, type AppPrismaClient } from "@/prisma/db";

type ModelWhereInputMap = {
  contact: Prisma.ContactWhereInput;
  organization: Prisma.OrganizationWhereInput;
  user: Prisma.UserWhereInput;
  deal: Prisma.DealWhereInput;
  service: Prisma.ServiceWhereInput;
  task: Prisma.TaskWhereInput;
};

export abstract class BaseRepository<
  TWhereInput extends Record<string, unknown> = Record<string, unknown>,
> extends BaseQueryBuilder<TWhereInput> {
  public get prisma() {
    return getTransactionClient<AppPrismaClient>() ?? prisma;
  }

  public get user(): ExtendedUser {
    if (isTenantGuardBypassed()) throw new Error("User is not available when tenant is bypassed");

    return getTenantUser();
  }

  public get companyId(): string {
    return this.user.companyId;
  }

  public get userId(): string {
    return this.user.id;
  }

  protected accessWhere<R extends keyof ModelWhereInputMap>(resource: R): ModelWhereInputMap[R] {
    const modelToResourceMap: Record<keyof ModelWhereInputMap, Resource> = {
      contact: Resource.contacts,
      organization: Resource.organizations,
      user: Resource.users,
      deal: Resource.deals,
      service: Resource.services,
      task: Resource.tasks,
    };

    const permissionResource = modelToResourceMap[resource];

    const canReadAll = this.hasPermission(permissionResource, Action.readAll);
    const canReadOwn = this.hasPermission(permissionResource, Action.readOwn);

    if (canReadAll) return { companyId: this.companyId };

    if (canReadOwn) return this.resourceOwnWhereMap[resource](this.companyId, this.userId);

    return { id: { in: [] }, companyId: this.companyId };
  }

  protected hasPermission = (resource: Resource, action: Action): boolean => {
    if (!this.user.role) return false;

    if (this.user.role.isSystemRole) return true;

    return this.user.role.permissions.some((p) => p.resource === resource && p.action === action);
  };

  protected canAccess = (resource: Resource): boolean => {
    return this.hasPermission(resource, Action.readAll) || this.hasPermission(resource, Action.readOwn);
  };

  private readonly resourceOwnWhereMap: {
    [K in keyof ModelWhereInputMap]: (companyId: string, userId: string) => ModelWhereInputMap[K];
  } = {
    contact: (companyId, userId) => ({ companyId, users: { some: { userId } } }),
    organization: (companyId, userId) => ({ companyId, users: { some: { userId } } }),
    user: (companyId, userId) => ({ id: userId, companyId }),
    deal: (companyId, userId) => ({ companyId, users: { some: { userId } } }),
    service: (companyId, userId) => ({ companyId, users: { some: { userId } } }),
    task: (companyId, userId) => ({ companyId, users: { some: { userId } } }),
  };

  protected async list<TRow extends { id: string }, TMapped>(opts: {
    model: ListableModel;
    baseWhere: TWhereInput;
    select: unknown;
    params: GetQueryParams;
    map: (row: TRow) => TMapped;
  }): Promise<TMapped[]> {
    const findMany = (args: unknown): Promise<TRow[]> =>
      (this.prisma as unknown as Record<string, { findMany: (a: unknown) => Promise<unknown[]> }>)[opts.model].findMany(
        args,
      ) as Promise<TRow[]>;

    const args = await this.buildQueryArgs(opts.params, opts.baseWhere);

    if (args.customSort) {
      const candidates = (await findMany({
        where: args.where,
        select: {
          id: true,
          customFieldValues: {
            where: { columnId: args.customSort.columnId, entityType: opts.model as EntityType },
            select: { value: true },
            take: 1,
          },
        },
      })) as unknown as Array<{ id: string; customFieldValues: Array<{ value: string | null }> }>;

      const { direction, columnType } = args.customSort;
      candidates.sort((a, b) =>
        compareCustomFieldValues(a.customFieldValues[0]?.value, b.customFieldValues[0]?.value, direction, columnType),
      );

      const sortedIds = candidates.slice(args.skip, args.skip + args.take).map((c) => c.id);
      if (sortedIds.length === 0) return [];

      const fetched = await findMany({
        where: { id: { in: sortedIds }, ...opts.baseWhere },
        select: opts.select,
      });
      const byId = new Map(fetched.map((row) => [row.id, row]));
      return sortedIds.flatMap((id) => {
        const row = byId.get(id);
        return row ? [opts.map(row)] : [];
      });
    }

    const rows = await findMany({
      where: args.where,
      orderBy: args.orderBy,
      skip: args.skip,
      take: args.take,
      select: opts.select,
    });
    return rows.map(opts.map);
  }
}

type ListableModel = "deal" | "contact" | "organization" | "service" | "task";
