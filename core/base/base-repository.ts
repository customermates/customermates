import type { ExtendedUser } from "@/features/user/user.service";

import { Resource, Action } from "@/generated/prisma";
import type { Prisma } from "@/generated/prisma";

import { getTransactionClient } from "../decorators/transaction-context";
import { isTenantGuardBypassed, getTenantUser } from "../decorators/tenant-context";

import { BaseQueryBuilder } from "@/core/base/base-query-builder";
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

    if (canReadAll) return { companyId: this.user.companyId };

    if (canReadOwn) return this.resourceOwnWhereMap[resource](this.user.companyId, this.user.id);

    return { id: { in: [] }, companyId: this.user.companyId };
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
}
