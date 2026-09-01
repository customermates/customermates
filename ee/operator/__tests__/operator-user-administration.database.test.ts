import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import type { OperatorActor } from "@/core/decorators/operator-context";

import { runWithOperator } from "@/core/decorators/operator-context";
import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    DATABASE_URL: process.env.DATABASE_URL,
    HOSTED_AI_OPERATOR_CONTROLS_ENABLED: true,
    NODE_ENV: "test",
  },
}));

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

function operatorActor(userId = `operator-${randomUUID()}`): OperatorActor {
  actorIds.push(userId);
  return {
    authUserId: `auth-${randomUUID()}`,
    userId,
    companyId: `company-${randomUUID()}`,
    email: `${randomUUID()}@example.invalid`,
  };
}

async function createCompany(
  subscription:
    | false
    | {
        plan?: "starter" | "pro" | "business" | "enterprise";
        status?: "trial" | "active" | "cancelled" | "expired" | "pastDue" | "unPaid";
        quantity?: number | null;
        enterpriseCreditsPerUser?: number | null;
        lemonSqueezyId?: string | null;
      } = {},
) {
  const companyId = randomUUID();
  companyIds.push(companyId);
  await runWithoutTenant(async () => {
    await prisma.company.create({ data: { id: companyId } });
    if (subscription !== false) {
      await prisma.subscription.create({
        data: {
          companyId,
          plan: subscription.plan ?? "pro",
          status: subscription.status ?? "active",
          quantity: subscription.quantity ?? 1,
          enterpriseAgentCreditsPerUser: subscription.enterpriseCreditsPerUser ?? null,
          lemonSqueezyId: subscription.lemonSqueezyId ?? null,
          lemonSqueezyVariantId: subscription.lemonSqueezyId ? `variant-${randomUUID()}` : null,
          agentCreditAnchorAt: periodStart,
          trialEndDate: new Date("2026-09-15T08:00:00.000Z"),
          currentPeriodEnd: periodEnd,
        },
      });
    }
  });
  return companyId;
}

async function createUser(args: {
  companyId: string;
  email: string;
  status?: "active" | "inactive" | "pendingAuthorization";
  createdAt?: Date;
  roleId?: string;
  isPlatformOperator?: boolean;
  emailVerified?: boolean;
  firstName?: string;
  lastName?: string;
}) {
  const userId = randomUUID();
  const authUserId = randomUUID();
  authUserIds.push(authUserId);
  await runWithoutTenant(async () => {
    await prisma.user.create({
      data: {
        id: userId,
        companyId: args.companyId,
        email: args.email,
        firstName: args.firstName ?? "Operator",
        lastName: args.lastName ?? "Target",
        status: args.status ?? "active",
        roleId: args.roleId,
        isPlatformOperator: args.isPlatformOperator ?? false,
        agentCreditActivatedAt: args.status && args.status !== "active" ? null : periodStart,
        createdAt: args.createdAt,
      },
    });
    await prisma.authUser.create({
      data: {
        id: authUserId,
        companyId: args.companyId,
        email: args.email,
        name: `${args.firstName ?? "Operator"} ${args.lastName ?? "Target"}`,
        emailVerified: args.emailVerified ?? true,
      },
    });
  });
  return { userId, authUserId, email: args.email, companyId: args.companyId };
}

async function createUsage(args: {
  companyId: string;
  userId: string;
  state: "settled" | "reserved" | "retained";
  credits: number;
}) {
  return runWithoutTenant(() =>
    prisma.agentUsageEvent.create({
      data: {
        companyId: args.companyId,
        userId: args.userId,
        state: args.state,
        costMicrocents: args.state === "settled" ? BigInt(args.credits) * 1_000_000n : 0n,
        costSource: args.state === "settled" ? "measured" : "estimated",
        reservedCredits: args.credits,
        chargedCredits: args.state === "settled" ? args.credits : args.state === "retained" ? args.credits : 0,
        planSnapshot: "enterprise",
        subscriptionStatusSnapshot: "active",
        allowanceCreditsSnapshot: 10,
        periodStart,
        periodEnd,
        providerStartedAt: args.state === "reserved" ? null : now,
        settledAt: args.state === "reserved" ? null : now,
      },
    }),
  );
}

afterAll(async () => {
  await runWithoutTenant(async () => {
    await prisma.operatorAuditEvent.deleteMany({
      where: { actorUserId: { in: actorIds } },
    });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.authUser.deleteMany({ where: { id: { in: authUserIds } } });
  });
  await prisma.$disconnect();
});

describeDatabase("operator user administration against a real database", { timeout: 120_000 }, () => {
  it("returns minimal detail and summary and records no read events", async () => {
    const companyId = await createCompany({ plan: "pro", status: "active" });
    const role = await runWithoutTenant(() =>
      prisma.userRole.create({
        data: {
          companyId,
          name: `Reader ${randomUUID()}`,
          isSystemRole: false,
        },
      }),
    );
    const query = `paged-${randomUUID()}`;
    const users: Array<Awaited<ReturnType<typeof createUser>>> = [];
    for (let index = 0; index < 27; index += 1) {
      users.push(
        await createUser({
          companyId,
          email: `${query}-${index.toString().padStart(2, "0")}@example.invalid`,
          createdAt: new Date(periodStart.getTime() + index * 1_000),
          roleId: index === 0 ? role.id : undefined,
          emailVerified: index % 2 === 0,
          firstName: index === 0 ? "Linnea" : undefined,
          lastName: index === 0 ? "Example" : undefined,
        }),
      );
    }

    const actor = operatorActor();
    const repo = new PrismaOperatorRepo();

    const summary = await runWithOperator(actor, () => repo.getUserSummaryUnscoped());
    expect(summary.totalUsers).toBeGreaterThanOrEqual(27);
    expect(summary.totalCompanies).toBeGreaterThanOrEqual(1);
    expect(summary.byStatus.active).toBeGreaterThanOrEqual(27);
    expect(summary.byPlan.pro).toBeGreaterThanOrEqual(27);
    expect(summary.bySubscriptionStatus.active).toBeGreaterThanOrEqual(27);
    expect(summary.verifiedAuthUsers).toBeGreaterThanOrEqual(14);

    const detail = await runWithOperator(actor, () => repo.getUserDetailUnscoped(users[0].userId, now));
    expect(detail).toMatchObject({
      userId: users[0].userId,
      companyId,
      authEmailVerified: true,
      role: { name: role.name, isSystemRole: false },
      isCurrentOperator: false,
    });
    expect(JSON.stringify(detail)).not.toContain("lemonSqueezy");

    const audits = await runWithoutTenant(() =>
      prisma.operatorAuditEvent.findMany({
        where: {
          actorUserId: actor.userId,
          action: {
            in: [
              OPERATOR_AUDIT_ACTION.userListRead,
              OPERATOR_AUDIT_ACTION.userSummaryRead,
              OPERATOR_AUDIT_ACTION.userDetailRead,
            ],
          },
        },
      }),
    );
    expect(audits).toHaveLength(0);
  });

  it("rejects self-lockout and last-system-user removal while preserving activation semantics", async () => {
    const companyId = await createCompany();
    const role = await runWithoutTenant(() =>
      prisma.userRole.create({
        data: {
          companyId,
          name: `System ${randomUUID()}`,
          isSystemRole: true,
        },
      }),
    );
    const target = await createUser({
      companyId,
      email: `system-target-${randomUUID()}@example.invalid`,
      roleId: role.id,
    });
    const backup = await createUser({
      companyId,
      email: `system-backup-${randomUUID()}@example.invalid`,
      roleId: role.id,
      status: "pendingAuthorization",
    });
    const repo = new PrismaOperatorRepo();
    const pendingTask = await runWithoutTenant(() =>
      prisma.task.create({
        data: {
          companyId,
          name: "Pending authorization",
          relatedUserId: backup.userId,
          type: "userPendingAuthorization",
        },
      }),
    );

    await expect(
      runWithOperator(operatorActor(target.userId), () =>
        repo.updateUserStatusUnscoped(
          {
            userId: target.userId,
            status: "inactive",
            reason: "Exercise self lockout protection",
          },
          now,
        ),
      ),
    ).resolves.toBe("conflict");

    const actor = operatorActor();
    await expect(
      runWithOperator(actor, () =>
        repo.updateUserStatusUnscoped(
          {
            userId: target.userId,
            status: "pendingAuthorization",
            reason: "Exercise last system user protection",
          },
          now,
        ),
      ),
    ).resolves.toBe("conflict");

    const activated = await runWithOperator(actor, () =>
      repo.updateUserStatusUnscoped(
        {
          userId: backup.userId,
          status: "active",
          reason: "Restore a second system administrator",
        },
        now,
      ),
    );
    assertAdmitted(activated);
    expect(activated.status).toBe("active");
    expect(activated.agentCreditActivatedAt).toEqual(now);
    await expect(runWithoutTenant(() => prisma.task.findUnique({ where: { id: pendingTask.id } }))).resolves.toBeNull();

    const request = {
      userId: target.userId,
      status: "inactive" as const,
    };
    const first = await runWithOperator(actor, () => repo.updateUserStatusUnscoped(request, now));
    assertAdmitted(first);
    const repeated = await runWithOperator(actor, () => repo.updateUserStatusUnscoped(request, now));
    assertAdmitted(repeated);
    expect(first.status).toBe("inactive");
    expect(first.agentCreditActivatedAt).toBeNull();
    expect(repeated.status).toBe("inactive");
    const statusAudits = await runWithoutTenant(() =>
      prisma.operatorAuditEvent.findMany({
        where: { action: OPERATOR_AUDIT_ACTION.userStatusUpdate, targetUserId: request.userId },
      }),
    );
    expect(statusAudits).toHaveLength(2);
    expect(statusAudits.every(({ reason }) => reason === null)).toBe(true);
  });

  it("corrects provider-backed local snapshots without touching provider or period fields", async () => {
    const providerId = `provider-${randomUUID()}`;
    const companyId = await createCompany({
      plan: "pro",
      status: "active",
      quantity: 2,
      enterpriseCreditsPerUser: 10,
      lemonSqueezyId: providerId,
    });
    const target = await createUser({
      companyId,
      email: `subscription-${randomUUID()}@example.invalid`,
    });
    const missingCompanyId = await createCompany(false);
    const missing = await createUser({
      companyId: missingCompanyId,
      email: `missing-subscription-${randomUUID()}@example.invalid`,
    });
    const actor = operatorActor();
    const repo = new PrismaOperatorRepo();
    const before = await runWithoutTenant(() => prisma.subscription.findUniqueOrThrow({ where: { companyId } }));

    const request = {
      userId: target.userId,
      plan: "enterprise" as const,
      status: "pastDue" as const,
      quantity: 3,
      reason: "Correct a provider-managed local snapshot",
    };
    const first = await runWithOperator(actor, () => repo.correctSubscriptionSnapshotUnscoped(request, now));
    assertAdmitted(first);
    const repeated = await runWithOperator(actor, () => repo.correctSubscriptionSnapshotUnscoped(request, now));
    assertAdmitted(repeated);
    expect(first.subscription).toMatchObject({
      plan: "enterprise",
      status: "pastDue",
      quantity: 3,
      billingProviderManaged: true,
    });
    expect(first.statusMutation).toEqual({
      allowed: false,
      blockedReason: "provider_managed_seat_sync_required",
    });
    expect(repeated.subscription).toMatchObject({
      plan: "enterprise",
      status: "pastDue",
      quantity: 3,
    });

    const after = await runWithoutTenant(() => prisma.subscription.findUniqueOrThrow({ where: { companyId } }));
    expect(after).toMatchObject({
      lemonSqueezyId: before.lemonSqueezyId,
      lemonSqueezyVariantId: before.lemonSqueezyVariantId,
      agentCreditAnchorAt: before.agentCreditAnchorAt,
      trialEndDate: before.trialEndDate,
      currentPeriodEnd: before.currentPeriodEnd,
      plan: "enterprise",
      status: "pastDue",
      quantity: 3,
    });
    const snapshotAudits = await runWithoutTenant(() =>
      prisma.operatorAuditEvent.findMany({
        where: { action: OPERATOR_AUDIT_ACTION.subscriptionSnapshotCorrect, targetUserId: target.userId },
      }),
    );
    expect(snapshotAudits).toHaveLength(2);
    expect(snapshotAudits.map(({ metadata }) => metadata)).toContainEqual(
      expect.objectContaining({
        billingProviderManaged: true,
        previous: { plan: "pro", status: "active", quantity: 2 },
        next: { plan: "enterprise", status: "pastDue", quantity: 3 },
      }),
    );

    const userBeforeStatus = await runWithoutTenant(() =>
      prisma.user.findUniqueOrThrow({ where: { id: target.userId } }),
    );
    await expect(
      runWithOperator(actor, () =>
        repo.updateUserStatusUnscoped(
          {
            userId: target.userId,
            status: "inactive",
            reason: "Do not drift a provider-managed seat quantity",
          },
          now,
        ),
      ),
    ).resolves.toBe("conflict");
    await expect(
      runWithoutTenant(() => prisma.user.findUniqueOrThrow({ where: { id: target.userId } })),
    ).resolves.toEqual(userBeforeStatus);

    await expect(
      runWithOperator(actor, () =>
        repo.correctSubscriptionSnapshotUnscoped(
          {
            userId: missing.userId,
            plan: "pro",
            status: "active",
            quantity: 1,
            reason: "Do not create a missing subscription",
          },
          now,
        ),
      ),
    ).resolves.toBe("notFound");
  });

  it("resets credits with compensating rows, serializes concurrent resets, and never rewrites usage", async () => {
    const companyId = await createCompany({
      plan: "enterprise",
      status: "active",
      enterpriseCreditsPerUser: 10,
    });
    const target = await createUser({
      companyId,
      email: `reset-${randomUUID()}@example.invalid`,
    });
    const actor = operatorActor();
    const repo = new PrismaOperatorRepo();
    await Promise.all([
      createUsage({
        companyId,
        userId: target.userId,
        state: "settled",
        credits: 3,
      }),
      createUsage({
        companyId,
        userId: target.userId,
        state: "reserved",
        credits: 2,
      }),
      createUsage({
        companyId,
        userId: target.userId,
        state: "retained",
        credits: 1,
      }),
    ]);
    await runWithoutTenant(() =>
      prisma.agentCreditAdjustment.create({
        data: {
          companyId,
          userId: target.userId,
          creditDelta: 4,
          periodStart,
          periodEnd,
          reason: "Existing support adjustment",
          operationId: randomUUID(),
          createdByOperatorUserId: "fixture",
        },
      }),
    );
    const usageBefore = await runWithoutTenant(() =>
      prisma.agentUsageEvent.findMany({
        where: { companyId, userId: target.userId },
        orderBy: { state: "asc" },
      }),
    );

    const baseOperationId = randomUUID();
    const baseRequest = {
      userId: target.userId,
      mode: "baseAllowance" as const,
      reason: "Return allowance to the contracted base",
      operationId: baseOperationId,
    };
    const base = await runWithOperator(actor, () => repo.resetUserCreditsUnscoped(baseRequest, now));
    assertAdmitted(base);
    const baseReplay = await runWithOperator(actor, () => repo.resetUserCreditsUnscoped(baseRequest, now));
    assertAdmitted(baseReplay);
    expect(base.adjustment.creditDelta).toBe(-4);
    expect(base.user.creditPeriod).toMatchObject({
      baseAllowanceCredits: 10,
      adjustmentCredits: 0,
      committedCredits: 6,
      remainingCredits: 4,
    });
    expect(baseReplay.adjustment).toEqual(base.adjustment);

    const zeroRequests = [randomUUID(), randomUUID()].map((operationId) => ({
      userId: target.userId,
      mode: "zeroBalance" as const,
      reason: "Set the remaining balance to zero",
      operationId,
    }));
    const outcomes = await Promise.allSettled(
      zeroRequests.map((request) => runWithOperator(actor, () => repo.resetUserCreditsUnscoped(request, now))),
    );
    const results = outcomes.map((outcome) => {
      if (outcome.status !== "fulfilled") throw outcome.reason;
      return outcome.value;
    });
    const admittedResults = results.filter((value) => typeof value !== "string");
    expect(admittedResults).toHaveLength(1);
    expect(results.filter((value) => value === "conflict")).toHaveLength(1);

    const winner = admittedResults[0];
    expect(winner.adjustment.creditDelta).toBe(-4);
    expect(winner.user.creditPeriod).toMatchObject({
      effectiveAllowanceCredits: 6,
      committedCredits: 6,
      remainingCredits: 0,
      overageCredits: 0,
    });

    const winningOperationId = winner.adjustment.operationId;
    const winningRequest = zeroRequests.find((request) => request.operationId === winningOperationId);
    if (!winningRequest) throw new Error("Expected a successful zero-balance request.");
    const zeroReplay = await runWithOperator(actor, () => repo.resetUserCreditsUnscoped(winningRequest, now));
    assertAdmitted(zeroReplay);
    expect(zeroReplay.adjustment).toEqual(winner.adjustment);

    await expect(
      runWithOperator(actor, () =>
        repo.resetUserCreditsUnscoped(
          {
            userId: target.userId,
            mode: "zeroBalance",
            reason: "Exercise the zero-balance no-op guard",
            operationId: randomUUID(),
          },
          now,
        ),
      ),
    ).resolves.toBe("conflict");

    const usageAfter = await runWithoutTenant(() =>
      prisma.agentUsageEvent.findMany({
        where: { companyId, userId: target.userId },
        orderBy: { state: "asc" },
      }),
    );
    expect(usageAfter).toEqual(usageBefore);
    await expect(
      runWithoutTenant(() =>
        prisma.agentCreditAdjustment.count({
          where: { operationId: baseOperationId },
        }),
      ),
    ).resolves.toBe(1);
    await expect(
      runWithoutTenant(() =>
        prisma.operatorAuditEvent.count({
          where: { action: OPERATOR_AUDIT_ACTION.creditBalanceReset, targetUserId: target.userId },
        }),
      ),
    ).resolves.toBe(2);
    await expect(
      runWithoutTenant(() =>
        prisma.agentCreditAdjustment.count({
          where: {
            operationId: {
              in: zeroRequests.map((request) => request.operationId),
            },
          },
        }),
      ),
    ).resolves.toBe(1);
  });

  it("rejects a base reset that would undercut combined committed usage", async () => {
    const companyId = await createCompany({
      plan: "enterprise",
      status: "active",
      enterpriseCreditsPerUser: 5,
    });
    const target = await createUser({
      companyId,
      email: `undercut-reset-${randomUUID()}@example.invalid`,
    });
    const actor = operatorActor();
    const repo = new PrismaOperatorRepo();
    await Promise.all([
      createUsage({
        companyId,
        userId: target.userId,
        state: "settled",
        credits: 3,
      }),
      createUsage({
        companyId,
        userId: target.userId,
        state: "reserved",
        credits: 2,
      }),
      createUsage({
        companyId,
        userId: target.userId,
        state: "retained",
        credits: 1,
      }),
    ]);
    await runWithoutTenant(() =>
      prisma.agentCreditAdjustment.create({
        data: {
          companyId,
          userId: target.userId,
          creditDelta: 2,
          periodStart,
          periodEnd,
          reason: "Existing adjustment above committed usage",
          operationId: randomUUID(),
          createdByOperatorUserId: "fixture",
        },
      }),
    );
    const operationId = randomUUID();

    await expect(
      runWithOperator(actor, () =>
        repo.resetUserCreditsUnscoped(
          {
            userId: target.userId,
            mode: "baseAllowance",
            reason: "Exercise the committed lower bound",
            operationId,
          },
          now,
        ),
      ),
    ).resolves.toBe("conflict");
    await expect(
      runWithoutTenant(() => prisma.agentCreditAdjustment.findUnique({ where: { operationId } })),
    ).resolves.toBeNull();
    await expect(
      runWithoutTenant(() =>
        prisma.operatorAuditEvent.count({
          where: { action: OPERATOR_AUDIT_ACTION.creditAdjustmentCreate, targetUserId: target.userId },
        }),
      ),
    ).resolves.toBe(0);
  });

  it("refuses credit work with allowanceMissing until an Enterprise workspace has a contracted allowance", async () => {
    const repo = new PrismaOperatorRepo();
    const companyId = await createCompany({ plan: "enterprise", status: "active", enterpriseCreditsPerUser: null });
    const target = await createUser({
      companyId,
      email: `allowance-missing-${randomUUID()}@example.invalid`,
    });
    const actor = operatorActor();

    const refused = await runWithOperator(actor, () =>
      repo.createCreditAdjustmentUnscoped(
        {
          companyId,
          userId: target.userId,
          creditDelta: 500,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          operationId: randomUUID(),
        },
        now,
      ),
    );
    expect(refused).toBe("allowanceMissing");

    const refusedReset = await runWithOperator(actor, () =>
      repo.resetUserCreditsUnscoped({ userId: target.userId, mode: "baseAllowance", operationId: randomUUID() }, now),
    );
    expect(refusedReset).toBe("allowanceMissing");

    await runWithoutTenant(async () => {
      expect(await prisma.agentCreditAdjustment.count({ where: { companyId } })).toBe(0);
    });

    const provisioned = await runWithOperator(actor, () =>
      repo.updateEnterpriseAllowanceUnscoped({ companyId, creditsPerUser: 750 }, now),
    );
    assertAdmitted(provisioned);

    const accepted = await runWithOperator(actor, () =>
      repo.createCreditAdjustmentUnscoped(
        {
          companyId,
          userId: target.userId,
          creditDelta: 250,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          operationId: randomUUID(),
        },
        now,
      ),
    );
    assertAdmitted(accepted);

    await runWithoutTenant(async () => {
      expect(await prisma.agentCreditAdjustment.count({ where: { companyId } })).toBe(1);
    });
  });

  it("updates trial end and billing binding, auditing previous and next on every edit", async () => {
    const repo = new PrismaOperatorRepo();
    const providerId = `provider-${randomUUID()}`;
    const companyId = await createCompany({ plan: "pro", status: "trial", lemonSqueezyId: providerId });
    await createUser({ companyId, email: `terms-${randomUUID()}@example.invalid` });
    const actor = operatorActor();
    const extended = new Date("2026-11-20T22:59:59.999Z");

    const updated = await runWithOperator(actor, () =>
      repo.updateSubscriptionTermsUnscoped(
        { companyId, trialEndDate: extended.toISOString(), lemonSqueezyId: providerId },
        now,
      ),
    );
    assertAdmitted(updated);

    const cleared = await runWithOperator(actor, () =>
      repo.updateSubscriptionTermsUnscoped(
        { companyId, trialEndDate: extended.toISOString(), lemonSqueezyId: null },
        now,
      ),
    );
    assertAdmitted(cleared);

    await runWithoutTenant(async () => {
      const subscription = await prisma.subscription.findUniqueOrThrow({ where: { companyId } });
      expect(subscription.trialEndDate?.toISOString()).toBe(extended.toISOString());
      expect(subscription.lemonSqueezyId).toBeNull();
      expect(subscription.lemonSqueezyVariantId).toBeNull();

      const audits = await prisma.operatorAuditEvent.findMany({
        where: { actorUserId: actor.userId, action: OPERATOR_AUDIT_ACTION.subscriptionTermsUpdate },
        orderBy: { createdAt: "asc" },
      });
      expect(audits).toHaveLength(2);

      const first = audits[0]?.metadata as { previous?: Record<string, unknown>; next?: Record<string, unknown> };
      expect(first.previous?.lemonSqueezyId).toBe(providerId);
      expect(first.next?.trialEndDate).toBe(extended.toISOString());

      const second = audits[1]?.metadata as {
        previous?: Record<string, unknown>;
        next?: Record<string, unknown>;
        billingBindingCleared?: boolean;
      };
      expect(second.previous?.lemonSqueezyId).toBe(providerId);
      expect(second.next?.lemonSqueezyId).toBeNull();
      expect(second.billingBindingCleared).toBe(true);
    });
  });
});
