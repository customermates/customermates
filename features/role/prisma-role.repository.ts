import type { RepoArgs } from "@/core/utils/types";
import type { UpsertRoleRepo } from "@/features/role/upsert-role.repo";
import type { GetRolesRepo } from "@/features/role/get-roles.repo";
import type { DeleteRoleRepo } from "./delete-role.repo";
import type { UpdateUserRoleRepo } from "@/features/user/upsert/update-user-role.repo";
import type { FindRolesByIdsRepo } from "./find-roles-by-ids.repo";

import { Action } from "@/generated/prisma";

import type { Prisma } from "@/generated/prisma";

import { QueryRepository } from "@/core/base/query-repository";
import { MANAGE_ACTIONS, manageImpliesReadAll, RESOURCE_ACCESS } from "@/features/role/resource-access";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { type GetQueryParams } from "@/core/base/base-get.schema";

function roleDto<T extends { recordTypeGrants: Array<{ typeId: string; actions: Action[] }> }>(role: T) {
  const { recordTypeGrants, ...rest } = role;
  return { ...rest, recordGrants: recordTypeGrants };
}

export function mapRoleWithAssignments<T extends { _count: { users: number } }>(role: T) {
  const { _count, ...data } = role;

  return { ...data, hasUsersAssigned: _count.users > 0 };
}

export class PrismaRoleRepo
  extends QueryRepository
  implements UpsertRoleRepo, GetRolesRepo, DeleteRoleRepo, UpdateUserRoleRepo, FindRolesByIdsRepo
{
  private get baseSelect() {
    return {
      id: true,
      name: true,
      description: true,
      isSystemRole: true,
      createdAt: true,
      updatedAt: true,
      permissions: {
        select: {
          id: true,
          resource: true,
          action: true,
        },
      },
    } as const;
  }

  private get withRecordGrantsSelect() {
    return { ...this.baseSelect, recordTypeGrants: { select: { typeId: true, actions: true } } } as const;
  }

  private get withAssignmentsSelect() {
    return {
      ...this.baseSelect,
      _count: {
        select: {
          users: true,
        },
      },
    } as const;
  }

  getSortableFields() {
    return [{ field: "type", resolvedFields: ["isSystemRole", "name"], collate: true }];
  }

  async getItems(params: GetQueryParams) {
    return this.list({
      model: "userRole",
      baseWhere: { companyId: this.companyId },
      select: this.withAssignmentsSelect,
      params,
      map: (role: Prisma.UserRoleGetPayload<{ select: PrismaRoleRepo["withAssignmentsSelect"] }>) =>
        mapRoleWithAssignments(role),
    });
  }

  async getCount() {
    return await this.prisma.userRole.count({ where: { companyId: this.companyId } });
  }

  @Transaction
  async upsertRoleOrThrow(args: RepoArgs<UpsertRoleRepo, "upsertRoleOrThrow">) {
    const { companyId } = this.user;

    if (args.id) await this.prisma.userRole.findFirstOrThrow({ where: { id: args.id, companyId } });

    const roleData = {
      name: args.name,
      description: args.description,
      isSystemRole: false,
      companyId,
    };

    const savedRole = await this.prisma.userRole.upsert({
      where: {
        id: args.id ?? "",
        companyId,
      },
      create: roleData,
      update: roleData,
    });

    for (const { resource, actions } of args.permissions) {
      const stored = new Set(actions);
      if (manageImpliesReadAll(resource) && MANAGE_ACTIONS.some((action) => stored.has(action)))
        stored.add(Action.readAll);
      if (RESOURCE_ACCESS[resource].read.length === 0) stored.add(Action.readOwn).add(Action.readAll);
      await this.prisma.rolePermission.deleteMany({ where: { companyId, roleId: savedRole.id, resource } });
      await this.prisma.rolePermission.createMany({
        data: [...stored].map((action) => ({ roleId: savedRole.id, companyId, resource, action })),
      });
    }

    const role = await this.prisma.userRole.findFirstOrThrow({
      where: { id: savedRole.id, companyId },
      select: this.withRecordGrantsSelect,
    });

    return roleDto(role);
  }

  async isSystemRoleOrThrow(id: string) {
    const { companyId } = this.user;

    const role = await this.prisma.userRole.findFirstOrThrow({
      where: { id, companyId },
      select: { isSystemRole: true },
    });

    return role.isSystemRole;
  }

  async hasAnotherActiveSystemRoleUser(excludeUserId: string) {
    const { companyId } = this.user;

    const systemRole = await this.prisma.userRole.findFirst({ where: { companyId, isSystemRole: true } });

    if (!systemRole) return false;

    const count = await this.prisma.user.count({
      where: { companyId, id: { not: excludeUserId }, status: "active", roleId: systemRole.id },
    });

    return count > 0;
  }

  async hasUsersAssigned(id: string) {
    const { companyId } = this.user;

    const usersWithRole = await this.prisma.user.count({
      where: { roleId: id, companyId },
    });

    return usersWithRole > 0;
  }

  async getRoleByIdOrThrow(id: string) {
    const { companyId } = this.user;

    const role = await this.prisma.userRole.findFirstOrThrow({
      where: { id, companyId },
      select: this.withRecordGrantsSelect,
    });

    return roleDto(role);
  }

  async findRoleById(id: string) {
    const role = await this.prisma.userRole.findFirst({
      where: { id, companyId: this.companyId },
      select: this.withRecordGrantsSelect,
    });
    return role ? roleDto(role) : null;
  }

  async findIds(ids: Set<string>) {
    if (ids.size === 0) return new Set<string>();

    const { companyId } = this.user;

    const roles = await this.prisma.userRole.findMany({
      where: { id: { in: Array.from(ids) }, companyId },
      select: { id: true },
    });

    return new Set(roles.map((role) => role.id));
  }

  @Transaction
  async deleteRoleOrThrow(id: string) {
    const { companyId } = this.user;

    const role = await this.prisma.userRole.findFirstOrThrow({
      where: { id, companyId },
      select: this.withRecordGrantsSelect,
    });

    if (role.isSystemRole) throw new Error("Cannot delete system roles");

    if (await this.hasUsersAssigned(id)) throw new Error("Cannot delete role that is assigned to users");

    await this.prisma.userRole.deleteMany({
      where: { id, companyId },
    });

    return roleDto(role);
  }
}
