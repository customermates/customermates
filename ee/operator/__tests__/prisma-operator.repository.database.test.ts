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
  OPERATOR_CONSOLE_ENABLED: true,
}));

vi.mock("@/env", () => ({ env: operatorEnv }));

import { OperatorConfigurationError, OperatorConflictError } from "../operator.errors";
import { PrismaOperatorAccessRepo } from "../operator-access.service";
import { PrismaOperatorBootstrapService } from "../operator-bootstrap.service";
import { OPERATOR_AUDIT_ACTION } from "../operator.schema";
import { PrismaOperatorRepo } from "../prisma-operator.repository";

const { prisma } = await import("@/prisma/db");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];
const authUserIds: string[] = [];
const actorIds: string[] = [];
const now = new Date("2026-08-28T12:00:00.000Z");
const periodStart = new Date("2026-08-01T08:00:00.000Z");
const periodEnd = new Date("2026-09-01T08:00:00.000Z");

class RollbackBootstrapTest extends Error {}

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

  it("returns only an exact-email candidate projection across two companies and audits the read", async () => {
    const target = await seedEnterpriseUser(`target-${randomUUID()}@example.invalid`);
    const hidden = await seedEnterpriseUser(`hidden-${randomUUID()}@example.invalid`);
    const actor = operatorActor();
    const repo = new PrismaOperatorRepo();

    const candidate = await runWithOperator(actor, () =>
      repo.findCandidateAuditedUnscoped(target.email.toUpperCase(), now),
    );

    expect(candidate).toMatchObject({
      userId: target.userId,
      companyId: target.companyId,
      email: target.email,
      authEmailVerified: true,
      company: { companyId: target.companyId, seats: { total: 1, active: 1 } },
    });
    expect(JSON.stringify(candidate)).not.toContain(hidden.email);
    expect(JSON.stringify(candidate)).not.toContain(hidden.userId);

    const audits = await runWithoutTenant(() =>
      prisma.operatorAuditEvent.findMany({ where: { actorUserId: actor.userId } }),
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: OPERATOR_AUDIT_ACTION.candidateRead,
      targetCompanyId: target.companyId,
      targetUserId: target.userId,
    });
    expect(JSON.stringify(audits[0].metadata)).not.toContain(target.email);
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

    const candidate = await runWithOperator(actor, () => repo.findCandidateAuditedUnscoped(target.email, now));
    expect(candidate?.creditPeriod).toMatchObject({
      chargedCredits: 7,
      reservedCredits: 2,
      remainingCredits: 1,
    });

    const rejectedOperationId = randomUUID();
    await expect(
      runWithOperator(actor, () =>
        repo.createCreditAdjustmentOrThrowUnscoped(
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
    ).rejects.toBeInstanceOf(OperatorConflictError);

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
      await repo.createCreditAdjustmentOrThrowUnscoped(request, now),
      await repo.createCreditAdjustmentOrThrowUnscoped(request, now),
    ]);
    expect(replay).toEqual(first);

    const persisted = await runWithoutTenant(async () => ({
      adjustments: await prisma.agentCreditAdjustment.count({ where: { operationId } }),
      rejectedAdjustments: await prisma.agentCreditAdjustment.count({ where: { operationId: rejectedOperationId } }),
      auditEvents: await prisma.operatorAuditEvent.count({ where: { operationId } }),
      rejectedAuditEvents: await prisma.operatorAuditEvent.count({ where: { operationId: rejectedOperationId } }),
    }));
    expect(persisted).toEqual({
      adjustments: 1,
      rejectedAdjustments: 0,
      auditEvents: 1,
      rejectedAuditEvents: 0,
    });
  });

  it("does not return a read and rolls an Enterprise update back when audit persistence fails", async () => {
    const target = await seedEnterpriseUser(`rollback-${randomUUID()}@example.invalid`, 10);
    const invalidActor = operatorActor("x".repeat(201));
    const repo = new PrismaOperatorRepo();

    await expect(
      runWithOperator(invalidActor, () => repo.getCompanyAuditedOrThrowUnscoped(target.companyId, now)),
    ).rejects.toThrow();

    await expect(
      runWithOperator(invalidActor, () =>
        repo.updateEnterpriseAllowanceOrThrowUnscoped(
          {
            companyId: target.companyId,
            creditsPerUser: 50,
            reason: "Exercise atomic audit rollback",
            operationId: randomUUID(),
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

  it("bootstraps only one active verified email candidate and audits it atomically", async () => {
    const companyId = randomUUID();
    const userId = randomUUID();
    const authUserId = randomUUID();
    const email = `bootstrap-${randomUUID()}@example.invalid`;
    let observed: { resultUserId: string; auditCount: number; secondGrantRejected: boolean } | null = null;

    try {
      await runWithoutTenant(() =>
        runInTransaction(async () => {
          const tx = getTransactionClient<AppPrismaClient>();
          if (!tx) throw new Error("Expected bootstrap test transaction.");

          await tx.user.updateMany({
            where: { isPlatformOperator: true },
            data: { isPlatformOperator: false },
          });
          await tx.company.create({ data: { id: companyId } });
          await tx.user.create({
            data: {
              id: userId,
              companyId,
              email,
              firstName: "First",
              lastName: "Operator",
              status: "active",
            },
          });
          await tx.authUser.create({
            data: {
              id: authUserId,
              companyId,
              email,
              name: "First Operator",
              emailVerified: true,
            },
          });

          const service = new PrismaOperatorBootstrapService();
          const result = await service.bootstrapFirstOperatorUnscoped({
            email: `  ${email.toUpperCase()}  `,
            confirmationEmail: email,
          });
          const auditCount = await tx.operatorAuditEvent.count({
            where: { operationId: result.auditOperationId, action: OPERATOR_AUDIT_ACTION.operatorBootstrap },
          });
          let secondGrantRejected = false;
          try {
            await service.bootstrapFirstOperatorUnscoped({ email, confirmationEmail: email });
          } catch (error) {
            secondGrantRejected = error instanceof OperatorConflictError;
          }
          observed = { resultUserId: result.userId, auditCount, secondGrantRejected };

          throw new RollbackBootstrapTest();
        }),
      );
    } catch (error) {
      if (!(error instanceof RollbackBootstrapTest)) throw error;
    }

    expect(observed).toEqual({ resultUserId: userId, auditCount: 1, secondGrantRejected: true });
    await expect(runWithoutTenant(() => prisma.user.findUnique({ where: { id: userId } }))).resolves.toBeNull();
  });

  it("blocks global-control mutations server-side when the enforcement switch is off", async () => {
    const actor = operatorActor();
    const operationId = randomUUID();

    try {
      await runWithOperator(actor, () =>
        runWithoutTenant(() =>
          runInTransaction(async () => {
            const tx = getTransactionClient<AppPrismaClient>();
            if (!tx) throw new Error("Expected disabled-control test transaction.");
            await tx.$queryRaw`SELECT "id" FROM "HostedAiGlobalControl" WHERE "id" = 'global' FOR UPDATE`;
            const before = await tx.hostedAiGlobalControl.findUniqueOrThrow({ where: { id: "global" } });
            const repo = new PrismaOperatorRepo();
            operatorEnv.HOSTED_AI_OPERATOR_CONTROLS_ENABLED = false;
            try {
              await expect(
                repo.updateGlobalControlUnscoped({
                  expectedVersion: before.version,
                  hostedProviderWorkPaused: !before.hostedProviderWorkPaused,
                  monthlySpendCapMicrocents: "125000000",
                  reason: "Exercise disabled global control",
                  operationId,
                }),
              ).rejects.toBeInstanceOf(OperatorConfigurationError);
            } finally {
              operatorEnv.HOSTED_AI_OPERATOR_CONTROLS_ENABLED = true;
            }

            await expect(tx.hostedAiGlobalControl.findUniqueOrThrow({ where: { id: "global" } })).resolves.toEqual(
              before,
            );
            await expect(tx.operatorAuditEvent.findUnique({ where: { operationId } })).resolves.toBeNull();

            throw new RollbackBootstrapTest();
          }),
        ),
      );
    } catch (error) {
      if (!(error instanceof RollbackBootstrapTest)) throw error;
    }
  });

  it("locks and version-checks the singleton global control while keeping replay idempotent", async () => {
    const actor = operatorActor();
    const operationId = randomUUID();
    let observed: { versionAdvanced: boolean; replayEqual: boolean; staleRejected: boolean } | null = null;

    try {
      await runWithOperator(actor, () =>
        runWithoutTenant(() =>
          runInTransaction(async () => {
            const tx = getTransactionClient<AppPrismaClient>();
            if (!tx) throw new Error("Expected global-control test transaction.");
            const before = await tx.hostedAiGlobalControl.findUniqueOrThrow({ where: { id: "global" } });
            const request = {
              expectedVersion: before.version,
              hostedProviderWorkPaused: !before.hostedProviderWorkPaused,
              monthlySpendCapMicrocents: "250000000",
              reason: "Exercise optimistic global control",
              operationId,
            };
            const repo = new PrismaOperatorRepo();
            const first = await repo.updateGlobalControlUnscoped(request);
            const replay = await repo.updateGlobalControlUnscoped(request);
            let staleRejected = false;
            try {
              await repo.updateGlobalControlUnscoped({ ...request, operationId: randomUUID() });
            } catch (error) {
              staleRejected = error instanceof OperatorConflictError;
            }
            observed = {
              versionAdvanced: first.version === before.version + 1,
              replayEqual: JSON.stringify(replay) === JSON.stringify(first),
              staleRejected,
            };

            throw new RollbackBootstrapTest();
          }),
        ),
      );
    } catch (error) {
      if (!(error instanceof RollbackBootstrapTest)) throw error;
    }

    expect(observed).toEqual({ versionAdvanced: true, replayEqual: true, staleRejected: true });
    await expect(
      runWithoutTenant(() => prisma.operatorAuditEvent.findUnique({ where: { operationId } })),
    ).resolves.toBeNull();
  });
});
