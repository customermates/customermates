import type { PrismaClient } from "@/generated/prisma";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  SYNTHETIC_COMPANY_USERS,
  SYNTHETIC_SEED_USER,
  SYNTHETIC_SHARED_USER_PASSWORD,
} from "@/core/config/synthetic-seed-user";

import { SEED_IDS, type SeedContext } from "../seeds/context";
import { seedIdentity, SYNTHETIC_AUTH_IDENTITY_DEFINITIONS } from "../seeds/identity";

const { hashPasswordMock } = vi.hoisted(() => ({ hashPasswordMock: vi.fn() }));

vi.mock("better-auth/crypto", () => ({ hashPassword: hashPasswordMock }));

const HASHED_SHARED_PASSWORD = "hashed-shared-synthetic-password";

type UpsertInput = { create: Record<string, unknown> };
type TransactionOperation = (prisma: {
  rolePermission: {
    deleteMany: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  userRole: { upsert: ReturnType<typeof vi.fn> };
}) => Promise<unknown>;

function recordingPrisma() {
  const authUserUpsert = vi.fn((input: UpsertInput) => Promise.resolve(input.create));
  const authAccountUpsert = vi.fn((input: UpsertInput) => Promise.resolve(input.create));
  const companyUpsert = vi.fn((input: UpsertInput) => Promise.resolve(input.create));
  const subscriptionUpsert = vi.fn((input: UpsertInput) => Promise.resolve(input.create));
  const userUpsert = vi.fn((input: UpsertInput) => Promise.resolve(input.create));
  const roleUpsert = vi.fn((input: UpsertInput) => Promise.resolve(input.create));
  const permissionUpsert = vi.fn((input: UpsertInput) => Promise.resolve(input.create));
  const permissionDeleteMany = vi.fn(() => Promise.resolve({ count: 0 }));

  const prisma = {
    authAccount: {
      upsert: authAccountUpsert,
    },
    authUser: {
      upsert: authUserUpsert,
    },
    company: { upsert: companyUpsert },
    subscription: {
      upsert: subscriptionUpsert,
    },
    user: {
      upsert: userUpsert,
    },
    $transaction: vi.fn((operation: TransactionOperation) =>
      operation({
        rolePermission: {
          deleteMany: permissionDeleteMany,
          upsert: permissionUpsert,
        },
        userRole: { upsert: roleUpsert },
      }),
    ),
  } as unknown as PrismaClient;

  return {
    calls: {
      authAccountUpsert,
      authUserUpsert,
      companyUpsert,
      permissionDeleteMany,
      permissionUpsert,
      roleUpsert,
      subscriptionUpsert,
      userUpsert,
    },
    prisma,
  };
}

function context(prisma: PrismaClient): SeedContext {
  return {
    baseUrl: "https://demo.example",
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
        image: new URL(identity.avatarPath, "https://demo.example").toString(),
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

    expect(calls.userUpsert.mock.calls.map(([input]) => input.create)).toMatchObject([
      {
        email: SYNTHETIC_COMPANY_USERS.maxBergmann.email,
        roleId: SEED_IDS.role,
        status: "active",
      },
      {
        email: SYNTHETIC_COMPANY_USERS.sofiaRossi.email,
        roleId: null,
        status: "pendingAuthorization",
      },
      {
        email: SYNTHETIC_COMPANY_USERS.elenaHoffmann.email,
        roleId: SEED_IDS.customerSuccessRole,
        status: "active",
      },
    ]);
  });
});
