import type { PrismaClient } from "@/generated/prisma";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { SYNTHETIC_SHARED_USER_PASSWORD } from "@/core/config/synthetic-seed-user";

import { SEED_IDS, type SeedContext } from "../seeds/context";
import {
  seedHostedAiOperatorFixtures,
  seedHostedAiOperatorUserTableFixtures,
  seedLocalHostedAiOperatorAccess,
  SYNTHETIC_HOSTED_AI_ORDINARY_USER,
  SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS,
  SYNTHETIC_HOSTED_AI_USAGE,
} from "../seeds/hosted-ai-operator";

const { hashPasswordMock } = vi.hoisted(() => ({ hashPasswordMock: vi.fn() }));

vi.mock("better-auth/crypto", () => ({ hashPassword: hashPasswordMock }));

type UpsertInput = { create: Record<string, unknown>; update: Record<string, unknown> };

function recordingPrisma() {
  const upsert = () => vi.fn((input: UpsertInput) => Promise.resolve(input.create));
  const calls = {
    agentUsageEventUpsert: upsert(),
    authAccountDeleteMany: vi.fn(() => Promise.resolve({ count: 0 })),
    authAccountUpsert: upsert(),
    authUserDelete: vi.fn(() => Promise.resolve({})),
    authUserFindUnique: vi.fn(() => Promise.resolve(null)),
    authUserUpdate: vi.fn(() => Promise.resolve({})),
    authUserUpsert: upsert(),
    companyUpsert: upsert(),
    subscriptionDeleteMany: vi.fn(() => Promise.resolve({ count: 0 })),
    subscriptionUpsert: upsert(),
    userRoleUpsert: upsert(),
    userDelete: vi.fn(() => Promise.resolve({})),
    userFindUnique: vi.fn(() => Promise.resolve(null)),
    userUpdate: vi.fn(() => Promise.resolve({})),
    userUpsert: upsert(),
  };
  const prisma = {
    agentUsageEvent: { upsert: calls.agentUsageEventUpsert },
    authAccount: { deleteMany: calls.authAccountDeleteMany, upsert: calls.authAccountUpsert },
    authUser: {
      delete: calls.authUserDelete,
      findUnique: calls.authUserFindUnique,
      update: calls.authUserUpdate,
      upsert: calls.authUserUpsert,
    },
    company: { upsert: calls.companyUpsert },
    subscription: { deleteMany: calls.subscriptionDeleteMany, upsert: calls.subscriptionUpsert },
    userRole: { upsert: calls.userRoleUpsert },
    user: {
      delete: calls.userDelete,
      findUnique: calls.userFindUnique,
      update: calls.userUpdate,
      upsert: calls.userUpsert,
    },
  } as unknown as PrismaClient;
  return { calls, prisma };
}

function context(prisma: PrismaClient): SeedContext {
  return {
    ids: SEED_IDS,
    prisma,
    seedUserEmail: "unused@example.invalid",
    sharedUserPassword: SYNTHETIC_SHARED_USER_PASSWORD,
  };
}

beforeEach(() => {
  hashPasswordMock.mockReset().mockResolvedValue("hashed-local-fixture-password");
});

describe("hosted AI operator synthetic fixtures", () => {
  it("defines more than one operator page across every user, plan and subscription status filter", () => {
    expect(SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS).toHaveLength(32);
    expect(new Set(SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS.map(({ status }) => status))).toEqual(
      new Set(["active", "inactive", "pendingAuthorization"]),
    );
    expect(
      new Set(SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS.map(({ subscription }) => subscription?.plan ?? null)),
    ).toEqual(new Set(["starter", "pro", "business", "enterprise", null]));
    expect(
      new Set(SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS.map(({ subscription }) => subscription?.status ?? null)),
    ).toEqual(new Set(["trial", "active", "cancelled", "expired", "pastDue", "unPaid", null]));

    const operatorStatuses = new Set(
      SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS.filter(({ isPlatformOperator }) => isPlatformOperator).map(
        ({ status }) => status,
      ),
    );
    expect(operatorStatuses).toEqual(new Set(["active", "inactive", "pendingAuthorization"]));
    expect(SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS.some(({ authEmailVerified }) => !authEmailVerified)).toBe(
      true,
    );
    expect(SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS.filter(({ subscription }) => !subscription)).toHaveLength(4);

    const providerManaged = SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS.filter(
      ({ subscription }) => subscription?.lemonSqueezyId,
    );
    expect(providerManaged).toHaveLength(1);
    expect(providerManaged[0]?.subscription).toMatchObject({
      lemonSqueezyId: "synthetic-operator-provider-subscription",
      lemonSqueezyVariantId: "synthetic-operator-provider-variant",
      plan: "pro",
      status: "active",
    });
    expect(
      SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS.every(
        ({ subscription }) =>
          !subscription ||
          subscription.quantity === null ||
          (Number.isInteger(subscription.quantity) && subscription.quantity >= 1),
      ),
    ).toBe(true);

    const activeEnterprise = SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS.filter(
      ({ subscription }) => subscription?.plan === "enterprise" && subscription.status === "active",
    ).map(({ subscription }) => subscription?.enterpriseAgentCreditsPerUser);
    expect(activeEnterprise).toContain(null);
    expect(activeEnterprise.some((allowance) => typeof allowance === "number" && allowance > 0)).toBe(true);

    expect(new Set(SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS.map(({ id }) => id)).size).toBe(32);
    expect(new Set(SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS.map(({ email }) => email)).size).toBe(32);
    expect(SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS.every(({ email }) => email.endsWith("@example.invalid"))).toBe(
      true,
    );
    expect(
      SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS.some(
        ({ createdAt }, index, definitions) =>
          index > 0 && createdAt.getTime() === definitions[index - 1]?.createdAt.getTime(),
      ),
    ).toBe(true);
  });

  it("creates an ordinary verified Enterprise tenant and finite enabled global control", async () => {
    const { calls, prisma } = recordingPrisma();
    const now = new Date("2026-08-28T12:00:00.000Z");

    await seedHostedAiOperatorFixtures(context(prisma), now);

    expect(SYNTHETIC_HOSTED_AI_ORDINARY_USER.email).toMatch(/@example\.invalid$/u);
    expect(calls.userUpdate).not.toHaveBeenCalled();
    expect(calls.authUserUpsert.mock.calls[0]?.[0].create).toMatchObject({
      companyId: SEED_IDS.hostedAiFixtureCompany,
      email: SYNTHETIC_HOSTED_AI_ORDINARY_USER.email,
      emailVerified: true,
      id: SEED_IDS.hostedAiOrdinaryUser,
    });
    expect(calls.userUpsert.mock.calls[0]?.[0].create).toMatchObject({
      companyId: SEED_IDS.hostedAiFixtureCompany,
      email: SYNTHETIC_HOSTED_AI_ORDINARY_USER.email,
      id: SEED_IDS.hostedAiOrdinaryUser,
      isPlatformOperator: false,
      roleId: SEED_IDS.hostedAiFixtureRole,
      status: "active",
    });
    expect(calls.userRoleUpsert.mock.calls[0]?.[0].create).toMatchObject({
      companyId: SEED_IDS.hostedAiFixtureCompany,
      id: SEED_IDS.hostedAiFixtureRole,
      isSystemRole: true,
      name: "Admin",
    });
    expect(calls.subscriptionUpsert.mock.calls[0]?.[0].create).toMatchObject({
      companyId: SEED_IDS.hostedAiFixtureCompany,
      enterpriseAgentCreditsPerUser: null,
      id: SEED_IDS.hostedAiFixtureSubscription,
      plan: "enterprise",
      status: "active",
    });
  });

  it("grants the known-password operator only through the explicit local step", async () => {
    const { calls, prisma } = recordingPrisma();

    await seedLocalHostedAiOperatorAccess(context(prisma));
    await seedLocalHostedAiOperatorAccess(context(prisma));

    expect(calls.userUpdate).toHaveBeenCalledTimes(2);
    expect(calls.userUpdate).toHaveBeenLastCalledWith({
      where: { id: SEED_IDS.user },
      data: { isPlatformOperator: true },
    });
  });

  it("forces every operator-table flag off unless local access is explicit", async () => {
    const { calls, prisma } = recordingPrisma();

    await seedHostedAiOperatorUserTableFixtures(context(prisma));

    const users = calls.userUpsert.mock.calls.map(([input]) => input.create);
    expect(users).toHaveLength(32);
    expect(users.every(({ isPlatformOperator }) => isPlatformOperator === false)).toBe(true);
  });

  it("converges the three ledger states when run twice in the same period", async () => {
    const { calls, prisma } = recordingPrisma();
    const now = new Date("2026-08-28T12:00:00.000Z");

    await seedHostedAiOperatorFixtures(context(prisma), now);
    await seedHostedAiOperatorFixtures(context(prisma), now);

    expect(hashPasswordMock).toHaveBeenCalledTimes(2);
    expect(calls.companyUpsert).toHaveBeenCalledTimes(2);
    expect(calls.userRoleUpsert).toHaveBeenCalledTimes(2);
    expect(calls.authUserUpsert).toHaveBeenCalledTimes(2);
    expect(calls.userUpsert).toHaveBeenCalledTimes(2);
    expect(calls.subscriptionUpsert).toHaveBeenCalledTimes(2);
    expect(calls.agentUsageEventUpsert).toHaveBeenCalledTimes(6);

    const firstRun = calls.agentUsageEventUpsert.mock.calls.slice(0, 3).map(([input]) => input.create);
    const secondRun = calls.agentUsageEventUpsert.mock.calls.slice(3).map(([input]) => input.update);
    expect(secondRun).toEqual(firstRun);
    expect(firstRun).toMatchObject([
      { id: SEED_IDS.hostedAiSettledUsage, ...SYNTHETIC_HOSTED_AI_USAGE.settled },
      { id: SEED_IDS.hostedAiReservedUsage, ...SYNTHETIC_HOSTED_AI_USAGE.reserved },
      { id: SEED_IDS.hostedAiReleasedUsage, ...SYNTHETIC_HOSTED_AI_USAGE.released },
    ]);
    for (const row of firstRun) {
      expect(row.periodStart).toEqual(new Date("2026-08-01T08:00:00.000Z"));
      expect(row.periodEnd).toEqual(new Date("2026-09-01T08:00:00.000Z"));
    }
  });

  it("converges the paginated operator user matrix across two runs", async () => {
    const { calls, prisma } = recordingPrisma();

    await seedHostedAiOperatorUserTableFixtures(context(prisma), { includeLocalOperatorAccess: true });
    await seedHostedAiOperatorUserTableFixtures(context(prisma), { includeLocalOperatorAccess: true });

    expect(calls.companyUpsert).toHaveBeenCalledTimes(64);
    expect(calls.authUserUpsert).toHaveBeenCalledTimes(64);
    expect(calls.userUpsert).toHaveBeenCalledTimes(64);
    expect(calls.subscriptionUpsert).toHaveBeenCalledTimes(56);
    expect(calls.subscriptionDeleteMany).toHaveBeenCalledTimes(8);
    expect(hashPasswordMock).not.toHaveBeenCalled();

    const firstUsers = calls.userUpsert.mock.calls.slice(0, 32).map(([input]) => input.create);
    const secondUsers = calls.userUpsert.mock.calls.slice(32).map(([input]) => input.update);
    expect(secondUsers).toEqual(firstUsers.map(({ id: _id, ...user }) => user));

    for (const [index, definition] of SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS.entries()) {
      expect(firstUsers[index]).toMatchObject({
        companyId: definition.companyId,
        createdAt: definition.createdAt,
        email: definition.email,
        firstName: definition.firstName,
        id: definition.id,
        isPlatformOperator: definition.isPlatformOperator,
        lastName: definition.lastName,
        status: definition.status,
      });
    }
  });
});
