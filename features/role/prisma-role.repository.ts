import type { RepoArgs } from "@/core/utils/types";
import type { UpsertRoleRepo } from "@/features/role/upsert-role.repo";
import type { GetRolesRepo } from "@/features/role/get-roles.repo";
import type { DeleteRoleRepo } from "./delete-role.repo";
import type { UpdateUserRoleRepo } from "@/features/user/upsert/update-user-role.repo";
import type { FindRolesByIdsRepo } from "./find-roles-by-ids.repo";

import { Action, Resource } from "@/generated/prisma";

import type { Prisma } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
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
  extends BaseRepository
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

    const permissions: Array<{
      roleId: string;
      companyId: string;
      resource: Resource;
      action: Action;
    }> = [];

    for (const [resourceKey, permission] of Object.entries(args.permissions)) {
      if (!permission) continue;
      const resource = resourceKey as Resource;
      const isManageOnlyResource =
        (resource === "company" || resource === "dataModel") &&
        "canManage" in permission &&
        permission.canManage !== undefined;
      const changedActions: Action[] = [];
      if ("canManage" in permission && permission.canManage !== undefined)
        changedActions.push(Action.create, Action.update, Action.delete);
      if (("readAccess" in permission && permission.readAccess !== undefined) || isManageOnlyResource)
        changedActions.push(Action.readOwn, Action.readAll);
      if (changedActions.length) {
        await this.prisma.rolePermission.deleteMany({
          where: { companyId, roleId: savedRole.id, resource, action: { in: changedActions } },
        });
      }

      if ("canManage" in permission && permission.canManage === "yes") {
        permissions.push(
          { roleId: savedRole.id, companyId, resource, action: Action.create },
          { roleId: savedRole.id, companyId, resource, action: Action.update },
          { roleId: savedRole.id, companyId, resource, action: Action.delete },
        );
        if (resource === Resource.wiki)
          permissions.push({ roleId: savedRole.id, companyId, resource, action: Action.readAll });
      }

      if (isManageOnlyResource) {
        permissions.push(
          { roleId: savedRole.id, companyId, resource, action: Action.readOwn },
          { roleId: savedRole.id, companyId, resource, action: Action.readAll },
        );
      }

      if ("readAccess" in permission) {
        switch (permission.readAccess) {
          case "own":
            permissions.push({ roleId: savedRole.id, companyId, resource, action: Action.readOwn });
            break;
          case "all":
            permissions.push({ roleId: savedRole.id, companyId, resource, action: Action.readAll });
            break;
          case "none":
          default:
            break;
        }
      }
    }

    const unique = new Map<string, { roleId: string; companyId: string; resource: Resource; action: Action }>();

    for (const p of permissions) unique.set(`${p.resource}:${p.action}`, p);

    if (permissions.length > 0) {
      await this.prisma.rolePermission.createMany({
        data: Array.from(unique.values()),
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
