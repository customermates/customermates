import { Action, Resource } from "@/generated/prisma";

import type { SeedContext } from "./context";

import { SEED_IDS } from "./context";
import { fixtureId } from "./helpers";

type RoleGrant = readonly [resource: Resource, actions: readonly Action[]];
export type SyntheticRolePermissionDefinition = Readonly<{
  action: Action;
  companyId: string;
  id: string;
  resource: Resource;
  roleId: string;
}>;
export type SyntheticRoleDefinition = Readonly<{
  companyId: string;
  description: string;
  id: string;
  isSystemRole: boolean;
  name: string;
  permissions: readonly SyntheticRolePermissionDefinition[];
}>;

const manageAll = [Action.create, Action.readAll, Action.update, Action.delete] as const;
const companyVisibility = [Action.readOwn, Action.readAll] as const;

function permissionFixtures(roleId: string, offset: number, grants: readonly RoleGrant[]) {
  return grants
    .flatMap(([resource, actions]) => actions.map((action) => [resource, action] as const))
    .map(([resource, action], index) => ({
      id: fixtureId("21000000", offset + index),
      roleId,
      companyId: SEED_IDS.company,
      resource,
      action,
    }));
}

const salesManagerGrants = [
  [Resource.contacts, manageAll],
  [Resource.organizations, manageAll],
  [Resource.deals, manageAll],
  [Resource.tasks, manageAll],
  [Resource.inboxMessages, manageAll],
  [Resource.services, [Action.readAll]],
  [Resource.users, [Action.readAll]],
  [Resource.auditLog, [Action.readAll]],
  [Resource.company, companyVisibility],
] as const satisfies readonly RoleGrant[];

const customerSuccessGrants = [
  [Resource.contacts, manageAll],
  [Resource.organizations, manageAll],
  [Resource.tasks, manageAll],
  [Resource.inboxMessages, manageAll],
  [Resource.deals, [Action.readAll]],
  [Resource.services, [Action.readAll]],
  [Resource.users, [Action.readOwn]],
  [Resource.company, companyVisibility],
] as const satisfies readonly RoleGrant[];

export const SYNTHETIC_ROLE_DEFINITIONS = [
  {
    id: SEED_IDS.role,
    companyId: SEED_IDS.company,
    description: "Full access to all features and settings",
    isSystemRole: true,
    name: "Admin",
    permissions: [],
  },
  {
    id: SEED_IDS.salesManagerRole,
    companyId: SEED_IDS.company,
    description: "Manages the sales pipeline, team workload, and customer conversations",
    isSystemRole: false,
    name: "Sales Manager",
    permissions: permissionFixtures(SEED_IDS.salesManagerRole, 1, salesManagerGrants),
  },
  {
    id: SEED_IDS.customerSuccessRole,
    companyId: SEED_IDS.company,
    description: "Manages customer relationships, follow-ups, and shared conversations",
    isSystemRole: false,
    name: "Customer Success",
    permissions: permissionFixtures(SEED_IDS.customerSuccessRole, 26, customerSuccessGrants),
  },
] satisfies readonly SyntheticRoleDefinition[];

export const SYNTHETIC_CUSTOM_ROLES = SYNTHETIC_ROLE_DEFINITIONS.filter(({ isSystemRole }) => !isSystemRole);
export const SYNTHETIC_ROLE_PERMISSION_COUNT = SYNTHETIC_ROLE_DEFINITIONS.reduce(
  (count, role) => count + role.permissions.length,
  0,
);

export async function seedRoles(context: SeedContext): Promise<void> {
  const roleIds = SYNTHETIC_ROLE_DEFINITIONS.map(({ id }) => id);
  const roles = SYNTHETIC_ROLE_DEFINITIONS.map(({ id, companyId, description, isSystemRole, name }) => ({
    id,
    companyId,
    description,
    isSystemRole,
    name,
  }));
  const desiredPermissions = SYNTHETIC_ROLE_DEFINITIONS.flatMap(({ permissions }) => permissions);

  await context.prisma.$transaction(async (prisma) => {
    for (const role of roles) await prisma.userRole.upsert({ where: { id: role.id }, update: role, create: role });

    for (const permission of desiredPermissions) {
      await prisma.rolePermission.upsert({
        where: { id: permission.id },
        update: permission,
        create: permission,
      });
    }

    await prisma.rolePermission.deleteMany({
      where: {
        roleId: { in: roleIds },
        id: { notIn: desiredPermissions.map(({ id }) => id) },
      },
    });
  });
}
