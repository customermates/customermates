import type { PrismaClient } from "@/generated/prisma";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  SYNTHETIC_COMPANY_USERS,
  SYNTHETIC_SEED_USER,
  SYNTHETIC_SHARED_USER_PASSWORD,
} from "@/core/config/synthetic-seed-user";

import { SEED_IDS, type SeedContext } from "../seeds/context";
import { seedIdentity, SYNTHETIC_AUTH_IDENTITY_DEFINITIONS, SYNTHETIC_SUBSCRIPTION } from "../seeds/identity";
import { SYNTHETIC_ROLE_DEFINITIONS } from "../seeds/roles";
import { SYNTHETIC_SEED_TIMELINE } from "../seeds/timeline";

const { hashPasswordMock } = vi.hoisted(() => ({ hashPasswordMock: vi.fn() }));

vi.mock("better-auth/crypto", () => ({ hashPassword: hashPasswordMock }));

const HASHED_SHARED_PASSWORD = "hashed-shared-synthetic-password";

type UpsertInput = { create: Record<string, unknown> };
type FindUniqueInput = { where: Record<string, unknown> };
type UpdateInput = { data: Record<string, unknown>; where: Record<string, unknown> };
type TransactionOperation = (prisma: {
  rolePermission: {
    delete: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  user: { updateMany: ReturnType<typeof vi.fn> };
  userRole: {
    delete: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
}) => Promise<unknown>;

function recordingPrisma() {
  const authUserUpsert = vi.fn((input: UpsertInput) => Promise.resolve(input.create));
  const authUserDelete = vi.fn((_input?: FindUniqueInput) => Promise.resolve({}));
  const authUserFindUnique = vi.fn((_input?: FindUniqueInput) => Promise.resolve(null as { id: string } | null));
  const authUserUpdate = vi.fn((_input?: UpdateInput) => Promise.resolve({}));
  const authAccountUpsert = vi.fn((input: UpsertInput) => Promise.resolve(input.create));
  const authAccountDeleteMany = vi.fn(() => Promise.resolve({ count: 0 }));
  const companyUpsert = vi.fn((input: UpsertInput) => Promise.resolve(input.create));
  const subscriptionUpsert = vi.fn((input: UpsertInput) => Promise.resolve(input.create));
  const userUpsert = vi.fn((input: UpsertInput) => Promise.resolve(input.create));
  const userDelete = vi.fn((_input?: FindUniqueInput) => Promise.resolve({}));
  const userFindUnique = vi.fn((_input?: FindUniqueInput) => Promise.resolve(null as { id: string } | null));
  const userUpdate = vi.fn((_input?: UpdateInput) => Promise.resolve({}));
  const roleDelete = vi.fn((_input?: FindUniqueInput) => Promise.resolve({}));
  const roleFindUnique = vi.fn((_input?: FindUniqueInput) => Promise.resolve(null as { id: string } | null));
  const roleUpdate = vi.fn((_input?: UpdateInput) => Promise.resolve({}));
  const roleUpsert = vi.fn((input: UpsertInput) => Promise.resolve(input.create));
  const permissionDelete = vi.fn((_input?: FindUniqueInput) => Promise.resolve({}));
  const permissionFindUnique = vi.fn((_input?: FindUniqueInput) => Promise.resolve(null as { id: string } | null));
  const permissionUpdate = vi.fn((_input?: UpdateInput) => Promise.resolve({}));
  const permissionUpsert = vi.fn((input: UpsertInput) => Promise.resolve(input.create));
  const permissionDeleteMany = vi.fn(() => Promise.resolve({ count: 0 }));
  const roleUserUpdateMany = vi.fn(() => Promise.resolve({ count: 0 }));

  const prisma = {
    authAccount: {
      deleteMany: authAccountDeleteMany,
      upsert: authAccountUpsert,
    },
    authUser: {
      delete: authUserDelete,
      findUnique: authUserFindUnique,
      update: authUserUpdate,
      upsert: authUserUpsert,
    },
    company: { upsert: companyUpsert },
    subscription: {
      upsert: subscriptionUpsert,
    },
    user: {
      delete: userDelete,
      findUnique: userFindUnique,
      update: userUpdate,
      upsert: userUpsert,
    },
    $transaction: vi.fn((operation: TransactionOperation) =>
      operation({
        rolePermission: {
          delete: permissionDelete,
          deleteMany: permissionDeleteMany,
          findUnique: permissionFindUnique,
          update: permissionUpdate,
          upsert: permissionUpsert,
        },
        user: { updateMany: roleUserUpdateMany },
        userRole: {
          delete: roleDelete,
          findUnique: roleFindUnique,
          update: roleUpdate,
          upsert: roleUpsert,
        },
      }),
    ),
  } as unknown as PrismaClient;

  return {
    calls: {
      authAccountUpsert,
      authAccountDeleteMany,
      authUserDelete,
      authUserFindUnique,
      authUserUpdate,
      authUserUpsert,
      companyUpsert,
      permissionDeleteMany,
      permissionDelete,
      permissionFindUnique,
      permissionUpdate,
      permissionUpsert,
      roleDelete,
      roleFindUnique,
      roleUpdate,
      roleUpsert,
      roleUserUpdateMany,
      subscriptionUpsert,
      userUpsert,
      userDelete,
      userFindUnique,
      userUpdate,
    },
    prisma,
  };
}

function context(prisma: PrismaClient): SeedContext {
  return {
    ids: SEED_IDS,
    prisma,
    seedUserEmail: SYNTHETIC_SEED_USER.email,
    sharedUserPassword: SYNTHETIC_SHARED_USER_PASSWORD,
  };
}

beforeEach(() => {
  hashPasswordMock.mockReset().mockResolvedValue(HASHED_SHARED_PASSWORD);
});

describe("synthetic Better Auth identities", () => {
  it("creates one verified credential identity per company member with the shared password", async () => {
    const { calls, prisma } = recordingPrisma();

    await seedIdentity(context(prisma));

    expect(hashPasswordMock).toHaveBeenCalledOnce();
    expect(hashPasswordMock).toHaveBeenCalledWith(SYNTHETIC_SHARED_USER_PASSWORD);

    const authUsers = calls.authUserUpsert.mock.calls.map(([input]) => input.create);
    expect(authUsers).toEqual(
      SYNTHETIC_AUTH_IDENTITY_DEFINITIONS.map((identity) => ({
        companyId: SEED_IDS.company,
        email: identity.email,
        emailVerified: true,
        id: identity.userId,
        image: identity.avatarPath,
        name: identity.name,
      })),
    );

    const credentialAccounts = calls.authAccountUpsert.mock.calls.map(([input]) => input.create);
    expect(credentialAccounts).toEqual(
      SYNTHETIC_AUTH_IDENTITY_DEFINITIONS.map((identity) => ({
        accountId: identity.userId,
        id: identity.credentialAccountId,
        password: HASHED_SHARED_PASSWORD,
        providerId: "credential",
        userId: identity.userId,
      })),
    );

    const companyMembers = calls.userUpsert.mock.calls.map(([input]) => input.create);
    expect(companyMembers).toMatchObject([
      {
        email: SYNTHETIC_COMPANY_USERS.maxBergmann.email,
        isPlatformOperator: false,
        roleId: SEED_IDS.role,
        status: "active",
      },
      {
        email: SYNTHETIC_COMPANY_USERS.sofiaRossi.email,
        roleId: SEED_IDS.salesManagerRole,
        status: "active",
      },
      {
        email: SYNTHETIC_COMPANY_USERS.elenaHoffmann.email,
        roleId: SEED_IDS.customerSuccessRole,
        status: "active",
      },
    ]);
    for (const [index, member] of companyMembers.entries()) {
      expect(member).toMatchObject(SYNTHETIC_SEED_TIMELINE.user(index));
      const timeline = SYNTHETIC_SEED_TIMELINE.user(index);
      expect(member.agentCreditActivatedAt).toEqual(timeline.createdAt);
      expect(member.onboardingWizardCompletedAt).toEqual(new Date(timeline.updatedAt.getTime() + 5 * 60_000));
      expect((member.onboardingWizardCompletedAt as Date).getTime()).toBeGreaterThan(timeline.createdAt.getTime());
    }

    expect(calls.companyUpsert.mock.calls[0]?.[0].create).toMatchObject(SYNTHETIC_SEED_TIMELINE.company);
    expect(calls.subscriptionUpsert).toHaveBeenCalledWith({
      where: { companyId: SEED_IDS.company },
      update: SYNTHETIC_SUBSCRIPTION,
      create: {
        id: SEED_IDS.subscription,
        companyId: SEED_IDS.company,
        ...SYNTHETIC_SUBSCRIPTION,
      },
    });
    for (const [index, [{ create }]] of calls.roleUpsert.mock.calls.entries()) {
      expect(create).toMatchObject(
        index === 0 ? SYNTHETIC_SEED_TIMELINE.systemRole : SYNTHETIC_SEED_TIMELINE.customRole(index - 1),
      );
    }
  });

  it("reconciles UI-recreated identities and roles by natural key and remains rerunnable", async () => {
    const { calls, prisma } = recordingPrisma();
    const salesRole = SYNTHETIC_ROLE_DEFINITIONS.find(({ id }) => id === SEED_IDS.salesManagerRole);
    const salesPermission = salesRole?.permissions[0];
    expect(salesRole).toBeDefined();
    expect(salesPermission).toBeDefined();
    if (!salesRole || !salesPermission) throw new Error("Sales fixtures must define a permission");

    const recreatedIds = {
      authUser: "ui-recreated-auth-user",
      member: "ui-recreated-company-member",
      permission: "ui-recreated-role-permission",
      role: "ui-recreated-sales-role",
    };
    const reconciled = {
      authUser: false,
      member: false,
      permission: false,
      role: false,
    };

    calls.authUserFindUnique.mockImplementation(({ where } = { where: {} }) => {
      if (where.id === SEED_IDS.sofiaRossiUser)
        return Promise.resolve(reconciled.authUser ? { id: SEED_IDS.sofiaRossiUser } : null);
      if (where.email === SYNTHETIC_COMPANY_USERS.sofiaRossi.email) {
        return Promise.resolve({
          id: reconciled.authUser ? SEED_IDS.sofiaRossiUser : recreatedIds.authUser,
        });
      }
      return Promise.resolve(null);
    });
    calls.authUserUpdate.mockImplementation(({ data, where } = { data: {}, where: {} }) => {
      if (where.id === recreatedIds.authUser && data.id === SEED_IDS.sofiaRossiUser) reconciled.authUser = true;
      return Promise.resolve({});
    });

    calls.userFindUnique.mockImplementation(({ where } = { where: {} }) => {
      if (where.id === SEED_IDS.sofiaRossiUser)
        return Promise.resolve(reconciled.member ? { id: SEED_IDS.sofiaRossiUser } : null);
      if (where.email === SYNTHETIC_COMPANY_USERS.sofiaRossi.email)
        return Promise.resolve({ id: reconciled.member ? SEED_IDS.sofiaRossiUser : recreatedIds.member });
      return Promise.resolve(null);
    });
    calls.userUpdate.mockImplementation(({ data, where } = { data: {}, where: {} }) => {
      if (where.id === recreatedIds.member && data.id === SEED_IDS.sofiaRossiUser) reconciled.member = true;
      return Promise.resolve({});
    });

    calls.roleFindUnique.mockImplementation(({ where } = { where: {} }) => {
      if (where.id === salesRole.id) return Promise.resolve(reconciled.role ? { id: salesRole.id } : null);
      const naturalKey = where.name_companyId as { companyId?: string; name?: string } | undefined;
      if (naturalKey?.companyId === salesRole.companyId && naturalKey.name === salesRole.name)
        return Promise.resolve({ id: reconciled.role ? salesRole.id : recreatedIds.role });
      return Promise.resolve(null);
    });
    calls.roleUpdate.mockImplementation(({ data, where } = { data: {}, where: {} }) => {
      if (where.id === recreatedIds.role && data.id === salesRole.id) reconciled.role = true;
      return Promise.resolve({});
    });

    calls.permissionFindUnique.mockImplementation(({ where } = { where: {} }) => {
      if (where.id === salesPermission.id)
        return Promise.resolve(reconciled.permission ? { id: salesPermission.id } : null);
      const naturalKey = where.roleId_resource_action as
        | { action?: string; resource?: string; roleId?: string }
        | undefined;
      if (
        naturalKey?.roleId === salesPermission.roleId &&
        naturalKey.resource === salesPermission.resource &&
        naturalKey.action === salesPermission.action
      ) {
        return Promise.resolve({
          id: reconciled.permission ? salesPermission.id : recreatedIds.permission,
        });
      }
      return Promise.resolve(null);
    });
    calls.permissionUpdate.mockImplementation(({ data, where } = { data: {}, where: {} }) => {
      if (where.id === recreatedIds.permission && data.id === salesPermission.id) reconciled.permission = true;
      return Promise.resolve({});
    });

    await seedIdentity(context(prisma));

    expect(reconciled).toEqual({ authUser: true, member: true, permission: true, role: true });
    expect(calls.authUserUpdate).toHaveBeenCalledWith({
      data: { id: SEED_IDS.sofiaRossiUser },
      where: { id: recreatedIds.authUser },
    });
    expect(calls.userUpdate).toHaveBeenCalledWith({
      data: { id: SEED_IDS.sofiaRossiUser },
      where: { id: recreatedIds.member },
    });
    expect(calls.roleUpdate).toHaveBeenCalledWith({
      data: { id: salesRole.id },
      where: { id: recreatedIds.role },
    });
    expect(calls.permissionUpdate).toHaveBeenCalledWith({
      data: { id: salesPermission.id },
      where: { id: recreatedIds.permission },
    });

    await expect(seedIdentity(context(prisma))).resolves.toBeUndefined();
    expect(calls.authUserUpdate).toHaveBeenCalledTimes(1);
    expect(calls.userUpdate).toHaveBeenCalledTimes(1);
    expect(calls.roleUpdate).toHaveBeenCalledTimes(1);
    expect(calls.permissionUpdate).toHaveBeenCalledTimes(1);
    expect(calls.authAccountDeleteMany).toHaveBeenCalledTimes(6);
    expect(calls.authAccountDeleteMany).toHaveBeenCalledWith({
      where: {
        id: { not: SEED_IDS.sofiaRossiCredentialAccount },
        providerId: "credential",
        userId: SEED_IDS.sofiaRossiUser,
      },
    });
  });
});
