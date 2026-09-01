import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import type { OperatorActor } from "@/core/decorators/operator-context";
import type { InteractiveSession } from "@/features/auth/auth.service";

import { runWithOperator } from "@/core/decorators/operator-context";
import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { getTransactionClient } from "@/core/decorators/transaction-context";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import type { AppPrismaClient } from "@/prisma/db";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const operatorEnv = vi.hoisted(() => ({
  APP_MODE: "cloud",
  DATABASE_URL: process.env.DATABASE_URL,
  HOSTED_AI_OPERATOR_CONTROLS_ENABLED: true,
  NODE_ENV: "test",
}));

vi.mock("@/env", () => ({ env: operatorEnv }));

import { PrismaOperatorAccessRepo } from "../prisma-operator-access.repository";
import { OPERATOR_AUDIT_ACTION } from "../operator.schema";
import type { OperatorRefusal } from "../operator.repo";
import { PrismaOperatorRepo } from "../prisma-operator.repository";

const OPERATOR_REFUSALS: OperatorRefusal[] = ["conflict", "notFound", "unavailable"];

function assertAdmitted<T>(result: T | OperatorRefusal): asserts result is T {
  const refusal = OPERATOR_REFUSALS.find((candidate) => candidate === result);
  if (refusal) throw new Error(`Expected a successful operator write but the repository refused with "${refusal}".`);
}

const { prisma } = await import("@/prisma/db");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];
const authUserIds: string[] = [];
const actorIds: string[] = [];
const now = new Date("2026-08-28T12:00:00.000Z");
const periodStart = new Date("2026-08-01T08:00:00.000Z");
const periodEnd = new Date("2026-09-01T08:00:00.000Z");

class RollbackOperatorTest extends Error {}

async function createPlatformAccessUser(
  tx: AppPrismaClient,
  args: { email?: string; status?: "active" | "inactive"; isPlatformOperator?: boolean; emailVerified?: boolean },
) {
  const companyId = randomUUID();
  const userId = randomUUID();
  const authUserId = randomUUID();
  const email = args.email ?? `platform-access-${randomUUID()}@example.invalid`;
  await tx.company.create({ data: { id: companyId } });
  await tx.user.create({
    data: {
      id: userId,
      companyId,
      email,
      firstName: "Platform",
      lastName: "Candidate",
      status: args.status ?? "active",
      isPlatformOperator: args.isPlatformOperator ?? false,
    },
  });
  await tx.authUser.create({
    data: {
      id: authUserId,
      companyId,
      email,
      name: "Platform Candidate",
      emailVerified: args.emailVerified ?? true,
    },
  });
  return { userId, companyId, email };
}

function operatorActor(userId = `operator-${randomUUID()}`): OperatorActor {
  actorIds.push(userId);
  return {
    authUserId: `auth-${randomUUID()}`,
    userId,
    companyId: `company-${randomUUID()}`,
    email: `${randomUUID()}@example.invalid`,
  };
}

async function seedEnterpriseUser(email: string, allowance = 10) {
  const companyId = randomUUID();
  const userId = randomUUID();
  const authUserId = randomUUID();
  companyIds.push(companyId);
  authUserIds.push(authUserId);

  await runWithoutTenant(async () => {
    await prisma.company.create({ data: { id: companyId } });
    await prisma.subscription.create({
      data: {
        companyId,
        plan: "enterprise",
        status: "active",
        enterpriseAgentCreditsPerUser: allowance,
        agentCreditAnchorAt: periodStart,
      },
    });
    await prisma.user.create({
      data: {
        id: userId,
        companyId,
        email,
        firstName: "Hosted",
        lastName: "AI",
        status: "active",
        agentCreditActivatedAt: periodStart,
      },
    });
    await prisma.authUser.create({
      data: {
        id: authUserId,
        companyId,
        email,
        name: "Hosted AI",
        emailVerified: true,
      },
    });
  });

  return { authUserId, companyId, userId, email };
}

afterAll(async () => {
  await runWithoutTenant(async () => {
    await prisma.operatorAuditEvent.deleteMany({ where: { actorUserId: { in: actorIds } } });
    for (const companyId of companyIds) {
      await prisma.agentCreditAdjustment.deleteMany({ where: { companyId } });
      await prisma.agentUsageEvent.deleteMany({ where: { companyId } });
      await prisma.user.deleteMany({ where: { companyId } });
      await prisma.subscription.deleteMany({ where: { companyId } });
      await prisma.company.deleteMany({ where: { id: companyId } });
    }
    await prisma.authUser.deleteMany({ where: { id: { in: authUserIds } } });
  });
  await prisma.$disconnect();
});

describeDatabase("PrismaOperatorRepo against a real database", { timeout: 120_000 }, () => {
  it("rechecks the session, verified auth user, active domain user, company, and persisted operator flag", async () => {
    const target = await seedEnterpriseUser(`operator-auth-${randomUUID()}@example.invalid`);
    const sessionId = randomUUID();
    await runWithoutTenant(async () => {
      await prisma.user.update({ where: { id: target.userId }, data: { isPlatformOperator: true } });
      await prisma.authSession.create({
        data: {
          id: sessionId,
          token: randomUUID(),
          userId: target.authUserId,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
    });
    const session = {
      session: { id: sessionId },
      user: { id: target.authUserId, email: target.email.toUpperCase() },
    } as InteractiveSession;
    const repo = new PrismaOperatorAccessRepo();

    await expect(repo.findAuthorizedActorUnscoped(session)).resolves.toMatchObject({
      authUserId: target.authUserId,
      userId: target.userId,
      companyId: target.companyId,
      email: target.email,
    });

    await runWithoutTenant(() =>
      prisma.authUser.update({ where: { id: target.authUserId }, data: { emailVerified: false } }),
    );
    await expect(repo.findAuthorizedActorUnscoped(session)).resolves.toBeNull();

    await runWithoutTenant(async () => {
      await prisma.authUser.update({ where: { id: target.authUserId }, data: { emailVerified: true } });
      await prisma.user.update({ where: { id: target.userId }, data: { status: "inactive" } });
    });
    await expect(repo.findAuthorizedActorUnscoped(session)).resolves.toBeNull();

    await runWithoutTenant(async () => {
      await prisma.user.update({
        where: { id: target.userId },
        data: { status: "active", isPlatformOperator: false },
      });
    });
    await expect(repo.findAuthorizedActorUnscoped(session)).resolves.toBeNull();

    await runWithoutTenant(async () => {
      await prisma.user.update({ where: { id: target.userId }, data: { isPlatformOperator: true } });
      await prisma.authSession.update({ where: { id: sessionId }, data: { expiresAt: new Date(Date.now() - 1) } });
    });
    await expect(repo.findAuthorizedActorUnscoped(session)).resolves.toBeNull();

    await runWithoutTenant(async () => {
      await prisma.user.update({ where: { id: target.userId }, data: { isPlatformOperator: false } });
      await prisma.authSession.delete({ where: { id: sessionId } });
    });
  });

  it("rejects a negative adjustment below committed usage and replays a valid operation once", async () => {
    const target = await seedEnterpriseUser(`adjust-${randomUUID()}@example.invalid`, 10);
    const actor = operatorActor();
    const repo = new PrismaOperatorRepo();

    await runWithoutTenant(() =>
      prisma.agentUsageEvent.create({
        data: {
          companyId: target.companyId,
          userId: target.userId,
          state: "settled",
          costMicrocents: 7_000_000n,
          costSource: "measured",
          reservedCredits: 7,
          chargedCredits: 7,
          planSnapshot: "enterprise",
          subscriptionStatusSnapshot: "active",
          allowanceCreditsSnapshot: 10,
          periodStart,
          periodEnd,
          providerStartedAt: now,
          settledAt: now,
        },
      }),
    );
    await runWithoutTenant(() =>
      prisma.agentUsageEvent.create({
        data: {
          companyId: target.companyId,
          userId: target.userId,
          state: "retained",
          costMicrocents: 0n,
          costSource: "estimated",
          reservedCredits: 2,
          chargedCredits: 2,
          planSnapshot: "enterprise",
          subscriptionStatusSnapshot: "active",
          allowanceCreditsSnapshot: 10,
          periodStart,
          periodEnd,
          providerStartedAt: now,
          settledAt: now,
        },
      }),
    );

    const detail = await runWithOperator(actor, () => repo.getUserDetailUnscoped(target.userId, now));
    assertAdmitted(detail);
    expect(detail.creditPeriod).toMatchObject({
      chargedCredits: 7,
      reservedCredits: 2,
      remainingCredits: 1,
    });

    const rejectedOperationId = randomUUID();
    await expect(
      runWithOperator(actor, () =>
        repo.createCreditAdjustmentUnscoped(
          {
            companyId: target.companyId,
            userId: target.userId,
            creditDelta: -2,
            periodStart: periodStart.toISOString(),
            periodEnd: periodEnd.toISOString(),
            reason: "Correct an over-grant",
            operationId: rejectedOperationId,
          },
          now,
        ),
      ),
    ).resolves.toBe("conflict");

    const operationId = randomUUID();
    const request = {
      companyId: target.companyId,
      userId: target.userId,
      creditDelta: 2,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      reason: "Correct a support-approved grant",
      operationId,
    };
    const [first, replay] = await runWithOperator(actor, async () => [
      await repo.createCreditAdjustmentUnscoped(request, now),
      await repo.createCreditAdjustmentUnscoped(request, now),
    ]);
    expect(replay).toEqual(first);

    const persisted = await runWithoutTenant(async () => ({
      adjustments: await prisma.agentCreditAdjustment.count({ where: { operationId } }),
      rejectedAdjustments: await prisma.agentCreditAdjustment.count({ where: { operationId: rejectedOperationId } }),
      auditEvents: await prisma.operatorAuditEvent.count({
        where: { action: OPERATOR_AUDIT_ACTION.creditAdjustmentCreate },
      }),
    }));
    expect(persisted).toEqual({
      adjustments: 1,
      rejectedAdjustments: 0,
      auditEvents: 1,
    });
  });

  it("rolls an Enterprise update back when audit persistence fails", async () => {
    const target = await seedEnterpriseUser(`rollback-${randomUUID()}@example.invalid`, 10);
    const invalidActor = operatorActor("x".repeat(201));
    const repo = new PrismaOperatorRepo();

    await expect(
      runWithOperator(invalidActor, () =>
        repo.updateEnterpriseAllowanceUnscoped(
          {
            companyId: target.companyId,
            creditsPerUser: 50,
            reason: "Exercise atomic audit rollback",
          },
          now,
        ),
      ),
    ).rejects.toThrow();

    const subscription = await runWithoutTenant(() =>
      prisma.subscription.findUniqueOrThrow({ where: { companyId: target.companyId } }),
    );
    expect(subscription.enterpriseAgentCreditsPerUser).toBe(10);
  });

  it("grants and revokes platform access, counting active operators in every workspace", async () => {
    const actor = operatorActor();
    let observed: {
      granted: boolean;
      auditActions: string[];
      otherRevoked: boolean;
      lastOperatorRejected: boolean;
    } | null = null;

    try {
      await runWithOperator(actor, () =>
        runWithoutTenant(() =>
          runInTransaction(async () => {
            const tx = getTransactionClient<AppPrismaClient>();
            if (!tx) throw new Error("Expected platform-access test transaction.");
            await tx.user.updateMany({ where: { isPlatformOperator: true }, data: { isPlatformOperator: false } });

            const target = await createPlatformAccessUser(tx, {});
            const elsewhere = await createPlatformAccessUser(tx, { isPlatformOperator: true });
            const repo = new PrismaOperatorRepo();

            const granted = await repo.updateUserPlatformAccessUnscoped(
              {
                userId: target.userId,
                isPlatformOperator: true,
                reason: "Grant operator access for this exercise",
              },
              now,
            );
            assertAdmitted(granted);

            const otherRevoked = await repo.updateUserPlatformAccessUnscoped(
              {
                userId: elsewhere.userId,
                isPlatformOperator: false,
                reason: "Revoke the operator in the other workspace",
              },
              now,
            );
            assertAdmitted(otherRevoked);

            let lastOperatorRejected = false;
            {
              const outcome = await repo.updateUserPlatformAccessUnscoped(
                {
                  userId: target.userId,
                  isPlatformOperator: false,
                  reason: "Attempt to remove the final active operator",
                },
                now,
              );
              lastOperatorRejected = outcome === "conflict";
            }

            const auditEvents = await tx.operatorAuditEvent.findMany({
              where: { actorUserId: actor.userId, action: OPERATOR_AUDIT_ACTION.userPlatformAccessUpdate },
              select: { action: true },
            });
            observed = {
              granted: granted.isPlatformOperator,
              auditActions: auditEvents.map((event) => event.action),
              otherRevoked: otherRevoked.isPlatformOperator,
              lastOperatorRejected,
            };

            throw new RollbackOperatorTest();
          }),
        ),
      );
    } catch (error) {
      if (!(error instanceof RollbackOperatorTest)) throw error;
    }

    expect(observed).toEqual({
      granted: true,
      auditActions: [OPERATOR_AUDIT_ACTION.userPlatformAccessUpdate, OPERATOR_AUDIT_ACTION.userPlatformAccessUpdate],
      otherRevoked: false,
      lastOperatorRejected: true,
    });
  });

  it("refuses a self change and an ineligible grant target", async () => {
    let observed: { self: boolean; inactive: boolean; unverified: boolean } | null = null;

    try {
      await runWithoutTenant(() =>
        runInTransaction(async () => {
          const tx = getTransactionClient<AppPrismaClient>();
          if (!tx) throw new Error("Expected platform-access guard test transaction.");
          await tx.user.updateMany({ where: { isPlatformOperator: true }, data: { isPlatformOperator: false } });

          const repo = new PrismaOperatorRepo();
          const rejects = async (actor: OperatorActor, userId: string) => {
            const outcome = await runWithOperator(actor, () =>
              repo.updateUserPlatformAccessUnscoped(
                {
                  userId,
                  isPlatformOperator: true,
                  reason: "Exercise the platform access guards",
                },
                now,
              ),
            );

            return outcome === "conflict";
          };

          const own = await createPlatformAccessUser(tx, {});
          const inactive = await createPlatformAccessUser(tx, { status: "inactive" });
          const unverified = await createPlatformAccessUser(tx, { emailVerified: false });
          observed = {
            self: await rejects(operatorActor(own.userId), own.userId),
            inactive: await rejects(operatorActor(), inactive.userId),
            unverified: await rejects(operatorActor(), unverified.userId),
          };

          throw new RollbackOperatorTest();
        }),
      );
    } catch (error) {
      if (!(error instanceof RollbackOperatorTest)) throw error;
    }

    expect(observed).toEqual({ self: true, inactive: true, unverified: true });
  });
});
