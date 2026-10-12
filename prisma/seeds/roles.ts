import { Action, Resource, type Prisma } from "@/generated/prisma";

import type { SeedContext } from "./context";

import { SEED_IDS } from "./context";
import { fixtureId } from "./helpers";
import { NORTHWIND_ROLE_IDS, type NorthwindTypeKey } from "./northwind-model";
import { SYNTHETIC_SEED_TIMELINE } from "./timeline";

type RoleGrant = readonly [resource: Resource, actions: readonly Action[]];
type SyntheticRecordKind = Exclude<NorthwindTypeKey, "lineItem">;
type RecordGrant = readonly [kind: SyntheticRecordKind, actions: readonly Action[]];
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
  recordGrants: readonly RecordGrant[];
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

const readAll = [Action.readAll] as const;
const contribute = [Action.create, Action.readOwn, Action.update] as const;
const shareAccounts = [Action.create, Action.readAll, Action.update] as const;

// Sales lead: every deal and the team forecast, plus marketing and partner lists; subscriptions read-only.
const salesManagerRecordGrants = [
  ["contact", manageAll],
  ["organization", manageAll],
  ["deal", manageAll],
  ["task", manageAll],
  ["service", readAll],
  ["campaign", manageAll],
  ["partner", manageAll],
  ["subscription", readAll],
  ["onboarding", readAll],
] as const satisfies readonly RecordGrant[];

const salesManagerGrants = [
  [Resource.inboxMessages, manageAll],
  [Resource.users, [Action.readAll]],
  [Resource.auditLog, [Action.readAll]],
  [Resource.wiki, [Action.readAll]],
  [Resource.routines, manageAll],
  [Resource.company, companyVisibility],
] as const satisfies readonly RoleGrant[];

// Customer success: subscriptions, onboarding projects and tickets; deals read-only.
const customerSuccessRecordGrants = [
  ["contact", manageAll],
  ["organization", manageAll],
  ["task", manageAll],
  ["deal", readAll],
  ["service", readAll],
  ["subscription", manageAll],
  ["onboarding", manageAll],
  ["ticket", manageAll],
] as const satisfies readonly RecordGrant[];

const customerSuccessGrants = [
  [Resource.inboxMessages, manageAll],
  [Resource.users, [Action.readOwn]],
  [Resource.wiki, [Action.readAll]],
  [Resource.routines, [Action.readOwn]],
  [Resource.company, companyVisibility],
] as const satisfies readonly RoleGrant[];

// Account executives: their own deals, shared accounts and contacts, subscriptions read-only.
const accountExecutiveRecordGrants = [
  ["contact", shareAccounts],
  ["organization", shareAccounts],
  ["deal", contribute],
  ["task", contribute],
  ["service", readAll],
  ["subscription", readAll],
  ["campaign", readAll],
  ["partner", readAll],
] as const satisfies readonly RecordGrant[];

const accountExecutiveGrants = [
  [Resource.inboxMessages, [Action.create, Action.readAll, Action.update]],
  [Resource.users, [Action.readOwn]],
  [Resource.wiki, [Action.readAll]],
  [Resource.company, companyVisibility],
] as const satisfies readonly RoleGrant[];

// Support: tickets only, with read access to the accounts, contacts and subscriptions behind them.
const supportRecordGrants = [
  ["ticket", manageAll],
  ["contact", readAll],
  ["organization", readAll],
  ["subscription", readAll],
  ["task", contribute],
] as const satisfies readonly RecordGrant[];

const supportGrants = [
  [Resource.inboxMessages, manageAll],
  [Resource.users, [Action.readOwn]],
  [Resource.wiki, [Action.readAll]],
  [Resource.company, companyVisibility],
] as const satisfies readonly RoleGrant[];

// People and operations: open roles and candidates, no customer or deal data.
const peopleOperationsRecordGrants = [
  ["openRole", manageAll],
  ["candidate", manageAll],
  ["task", manageAll],
] as const satisfies readonly RecordGrant[];

const peopleOperationsGrants = [
  [Resource.inboxMessages, [Action.create, Action.readAll, Action.update]],
  [Resource.users, [Action.readAll]],
  [Resource.wiki, manageAll],
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
    recordGrants: [],
  },
  {
    id: SEED_IDS.salesManagerRole,
    companyId: SEED_IDS.company,
    description: "Owns every deal, the team forecast, campaigns and partners",
    isSystemRole: false,
    name: "Sales lead",
    permissions: permissionFixtures(SEED_IDS.salesManagerRole, 1, salesManagerGrants),
    recordGrants: salesManagerRecordGrants,
  },
  {
    id: SEED_IDS.customerSuccessRole,
    companyId: SEED_IDS.company,
    description: "Runs subscriptions, onboarding projects and customer tickets",
    isSystemRole: false,
    name: "Customer success",
    permissions: permissionFixtures(SEED_IDS.customerSuccessRole, 31, customerSuccessGrants),
    recordGrants: customerSuccessRecordGrants,
  },
  {
    id: NORTHWIND_ROLE_IDS.accountExecutive,
    companyId: SEED_IDS.company,
    description: "Works their own deals on shared accounts; subscriptions are read-only",
    isSystemRole: false,
    name: "Account executive",
    permissions: permissionFixtures(NORTHWIND_ROLE_IDS.accountExecutive, 61, accountExecutiveGrants),
    recordGrants: accountExecutiveRecordGrants,
  },
  {
    id: NORTHWIND_ROLE_IDS.support,
    companyId: SEED_IDS.company,
    description: "Handles support tickets with read access to the accounts behind them",
    isSystemRole: false,
    name: "Support",
    permissions: permissionFixtures(NORTHWIND_ROLE_IDS.support, 91, supportGrants),
    recordGrants: supportRecordGrants,
  },
  {
    id: NORTHWIND_ROLE_IDS.peopleOperations,
    companyId: SEED_IDS.company,
    description: "Runs hiring: open roles and candidates, without deals",
    isSystemRole: false,
    name: "People and operations",
    permissions: permissionFixtures(NORTHWIND_ROLE_IDS.peopleOperations, 121, peopleOperationsGrants),
    recordGrants: peopleOperationsRecordGrants,
  },
] satisfies readonly SyntheticRoleDefinition[];

export const SYNTHETIC_CUSTOM_ROLES = SYNTHETIC_ROLE_DEFINITIONS.filter(({ isSystemRole }) => !isSystemRole);
export const SYNTHETIC_ROLE_PERMISSION_COUNT = SYNTHETIC_ROLE_DEFINITIONS.reduce(
  (count, role) => count + role.permissions.length,
  0,
);

async function reconcileRoleId(
  prisma: Prisma.TransactionClient,
  role: Omit<SyntheticRoleDefinition, "permissions" | "recordGrants"> & { createdAt: Date; updatedAt: Date },
): Promise<void> {
  const [existingById, existingByName] = await Promise.all([
    prisma.userRole.findUnique({ where: { id: role.id }, select: { id: true } }),
    prisma.userRole.findUnique({
      where: { name_companyId: { name: role.name, companyId: role.companyId } },
      select: { id: true },
    }),
  ]);

  if (existingByName && existingByName.id !== role.id) {
    if (existingById) {
      await prisma.user.updateMany({ where: { roleId: existingByName.id }, data: { roleId: role.id } });
      await prisma.userRole.delete({ where: { id: existingByName.id } });
    } else await prisma.userRole.update({ where: { id: existingByName.id }, data: { id: role.id } });
  }

  await prisma.userRole.upsert({
    where: { id: role.id },
    update: role,
    create: role,
  });
}

async function reconcilePermissionId(
  prisma: Prisma.TransactionClient,
  permission: SyntheticRolePermissionDefinition,
): Promise<void> {
  const [existingById, existingByGrant] = await Promise.all([
    prisma.rolePermission.findUnique({ where: { id: permission.id }, select: { id: true } }),
    prisma.rolePermission.findUnique({
      where: {
        roleId_resource_action: {
          roleId: permission.roleId,
          resource: permission.resource,
          action: permission.action,
        },
      },
      select: { id: true },
    }),
  ]);

  if (existingByGrant && existingByGrant.id !== permission.id) {
    if (existingById) await prisma.rolePermission.delete({ where: { id: existingByGrant.id } });
    else await prisma.rolePermission.update({ where: { id: existingByGrant.id }, data: { id: permission.id } });
  }

  await prisma.rolePermission.upsert({
    where: { id: permission.id },
    update: permission,
    create: permission,
  });
}

export async function seedRoles(context: SeedContext): Promise<void> {
  const roleIds = SYNTHETIC_ROLE_DEFINITIONS.map(({ id }) => id);
  const roles = SYNTHETIC_ROLE_DEFINITIONS.map(({ id, companyId, description, isSystemRole, name }, index) => ({
    id,
    companyId,
    description,
    isSystemRole,
    name,
    ...(index === 0 ? SYNTHETIC_SEED_TIMELINE.systemRole : SYNTHETIC_SEED_TIMELINE.customRole(index - 1)),
  }));
  const desiredPermissions = SYNTHETIC_ROLE_DEFINITIONS.flatMap(({ permissions }) => permissions);

  await context.prisma.$transaction(
    async (prisma) => {
      for (const role of roles) await reconcileRoleId(prisma, role);

      for (const permission of desiredPermissions) await reconcilePermissionId(prisma, permission);

      await prisma.rolePermission.deleteMany({
        where: {
          roleId: { in: roleIds },
          id: { notIn: desiredPermissions.map(({ id }) => id) },
        },
      });
    },
    { timeout: 60_000 },
  );
}
