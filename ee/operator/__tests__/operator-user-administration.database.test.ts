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

import { OperatorConflictError, OperatorNotFoundError } from "../operator.errors";
import { ListOperatorUsersSchema, OPERATOR_AUDIT_ACTION } from "../operator.schema";
import { PrismaOperatorRepo } from "../prisma-operator.repository";

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
  it("combines filters, paginates stably, returns minimal detail and summary, and records no read events", async () => {
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
    const first = await runWithOperator(actor, () =>
      repo.listUsersAuditedUnscoped(
        ListOperatorUsersSchema.parse({
          query,
          status: "active",
          subscriptionPlan: "pro",
          subscriptionStatus: "active",
          isPlatformOperator: false,
          sort: "oldest",
        }),
      ),
    );
    const second = await runWithOperator(actor, () =>
      repo.listUsersAuditedUnscoped(
        ListOperatorUsersSchema.parse({
          cursor: first.nextCursor,
          query,
          status: "active",
          subscriptionPlan: "pro",
          subscriptionStatus: "active",
          isPlatformOperator: false,
          sort: "oldest",
        }),
      ),
    );

    expect(first.total).toBe(27);
    expect(first.users.map((user) => user.userId)).toEqual(users.slice(0, 25).map((user) => user.userId));
    expect(first.nextCursor).toBe(users[24].userId);
    expect(second.users.map((user) => user.userId)).toEqual(users.slice(25).map((user) => user.userId));
    expect(second.nextCursor).toBeNull();
    const fullName = await runWithOperator(actor, () =>
      repo.listUsersAuditedUnscoped(
        ListOperatorUsersSchema.parse({
          query: "  Linnea\t  Example  ",
          sort: "emailAsc",
        }),
      ),
    );
    expect(fullName.users).toHaveLength(1);
    expect(fullName.users[0]).toMatchObject({ userId: users[0].userId, displayName: "Linnea Example" });
    expect(first.users[0]).toMatchObject({
      authEmailVerified: true,
      role: { name: role.name, isSystemRole: false },
      subscription: {
        plan: "pro",
        status: "active",
        billingProviderManaged: false,
      },
    });

    const summary = await runWithOperator(actor, () => repo.getUserSummaryAuditedUnscoped());
    expect(summary.totalUsers).toBeGreaterThanOrEqual(27);
    expect(summary.totalCompanies).toBeGreaterThanOrEqual(1);
    expect(summary.byStatus.active).toBeGreaterThanOrEqual(27);
    expect(summary.byPlan.pro).toBeGreaterThanOrEqual(27);
    expect(summary.bySubscriptionStatus.active).toBeGreaterThanOrEqual(27);
    expect(summary.verifiedAuthUsers).toBeGreaterThanOrEqual(14);

    const detail = await runWithOperator(actor, () => repo.getUserDetailAuditedOrThrowUnscoped(users[0].userId, now));
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

  it("rejects self-lockout, stale writes, and last-system-user removal while preserving activation semantics", async () => {
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
    const publishUserUpdated = vi.fn(() => Promise.resolve());
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
    const targetBefore = await runWithoutTenant(() => prisma.user.findUniqueOrThrow({ where: { id: target.userId } }));

    await expect(
      runWithOperator(operatorActor(target.userId), () =>
        repo.updateUserStatusOrThrowUnscoped(
          {
            userId: target.userId,
            expectedUpdatedAt: targetBefore.updatedAt.toISOString(),
            status: "inactive",
            reason: "Exercise self lockout protection",
            operationId: randomUUID(),
          },
          publishUserUpdated,
          now,
        ),
      ),
    ).rejects.toBeInstanceOf(OperatorConflictError);

    const actor = operatorActor();
    await expect(
      runWithOperator(actor, () =>
        repo.updateUserStatusOrThrowUnscoped(
          {
            userId: target.userId,
            expectedUpdatedAt: targetBefore.updatedAt.toISOString(),
            status: "pendingAuthorization",
            reason: "Exercise last system user protection",
            operationId: randomUUID(),
          },
          publishUserUpdated,
          now,
        ),
      ),
    ).rejects.toBeInstanceOf(OperatorConflictError);

    const backupBefore = await runWithoutTenant(() => prisma.user.findUniqueOrThrow({ where: { id: backup.userId } }));
    const activated = await runWithOperator(actor, () =>
      repo.updateUserStatusOrThrowUnscoped(
        {
          userId: backup.userId,
          expectedUpdatedAt: backupBefore.updatedAt.toISOString(),
          status: "active",
          reason: "Restore a second system administrator",
          operationId: randomUUID(),
        },
        publishUserUpdated,
        now,
      ),
    );
    expect(activated.status).toBe("active");
    expect(activated.agentCreditActivatedAt).toBe(now.toISOString());
    await expect(runWithoutTenant(() => prisma.task.findUnique({ where: { id: pendingTask.id } }))).resolves.toBeNull();
    expect(publishUserUpdated).toHaveBeenLastCalledWith(
      expect.objectContaining({ companyId, userId: backup.userId, status: "active" }),
    );

    await expect(
      runWithOperator(actor, () =>
        repo.updateUserStatusOrThrowUnscoped(
          {
            userId: target.userId,
            expectedUpdatedAt: "2000-01-01T00:00:00.000Z",
            status: "inactive",
            reason: "Exercise stale status protection",
            operationId: randomUUID(),
          },
          publishUserUpdated,
          now,
        ),
      ),
    ).rejects.toBeInstanceOf(OperatorConflictError);

    const operationId = randomUUID();
    const request = {
      userId: target.userId,
      expectedUpdatedAt: targetBefore.updatedAt.toISOString(),
      status: "inactive" as const,
      operationId,
    };
    const first = await runWithOperator(actor, () =>
      repo.updateUserStatusOrThrowUnscoped(request, publishUserUpdated, now),
    );
    const replay = await runWithOperator(actor, () =>
      repo.updateUserStatusOrThrowUnscoped(request, publishUserUpdated, now),
    );
    expect(first.status).toBe("inactive");
    expect(first.agentCreditActivatedAt).toBeNull();
    expect(replay.status).toBe("inactive");
    await expect(runWithoutTenant(() => prisma.operatorAuditEvent.count({ where: { operationId } }))).resolves.toBe(1);
    await expect(
      runWithoutTenant(() => prisma.operatorAuditEvent.findUniqueOrThrow({ where: { operationId } })),
    ).resolves.toMatchObject({ reason: null });

    const rollbackTarget = await createUser({
      companyId,
      email: `event-rollback-${randomUUID()}@example.invalid`,
      status: "pendingAuthorization",
    });
    const rollbackTask = await runWithoutTenant(() =>
      prisma.task.create({
        data: {
          companyId,
          name: "Pending event rollback",
          relatedUserId: rollbackTarget.userId,
          type: "userPendingAuthorization",
        },
      }),
    );
    const rollbackBefore = await runWithoutTenant(() =>
      prisma.user.findUniqueOrThrow({ where: { id: rollbackTarget.userId } }),
    );
    const rollbackOperationId = randomUUID();
    await expect(
      runWithOperator(actor, () =>
        repo.updateUserStatusOrThrowUnscoped(
          {
            userId: rollbackTarget.userId,
            expectedUpdatedAt: rollbackBefore.updatedAt.toISOString(),
            status: "active",
            reason: "Exercise canonical event rollback",
            operationId: rollbackOperationId,
          },
          () => Promise.reject(new Error("event persistence failed")),
          now,
        ),
      ),
    ).rejects.toThrow("event persistence failed");
    await expect(
      runWithoutTenant(() => prisma.user.findUniqueOrThrow({ where: { id: rollbackTarget.userId } })),
    ).resolves.toMatchObject({ status: "pendingAuthorization", agentCreditActivatedAt: null });
    await expect(
      runWithoutTenant(() => prisma.task.findUnique({ where: { id: rollbackTask.id } })),
    ).resolves.not.toBeNull();
    await expect(
      runWithoutTenant(() => prisma.operatorAuditEvent.findUnique({ where: { operationId: rollbackOperationId } })),
    ).resolves.toBeNull();
  });

  it("corrects provider-backed local snapshots without touching provider or period fields and replays idempotently", async () => {
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

    await expect(
      runWithOperator(actor, () =>
        repo.correctSubscriptionSnapshotOrThrowUnscoped(
          {
            userId: target.userId,
            expectedUpdatedAt: "2000-01-01T00:00:00.000Z",
            plan: "business",
            status: "pastDue",
            quantity: 3,
            reason: "Exercise stale subscription protection",
            operationId: randomUUID(),
          },
          now,
        ),
      ),
    ).rejects.toBeInstanceOf(OperatorConflictError);

    const operationId = randomUUID();
    const request = {
      userId: target.userId,
      expectedUpdatedAt: before.updatedAt.toISOString(),
      plan: "enterprise" as const,
      status: "pastDue" as const,
      quantity: 3,
      reason: "Correct a provider-managed local snapshot",
      operationId,
    };
    const first = await runWithOperator(actor, () => repo.correctSubscriptionSnapshotOrThrowUnscoped(request, now));
    const replay = await runWithOperator(actor, () => repo.correctSubscriptionSnapshotOrThrowUnscoped(request, now));
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
    expect(replay.subscription).toMatchObject({
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
    const audit = await runWithoutTenant(() => prisma.operatorAuditEvent.findUniqueOrThrow({ where: { operationId } }));
    expect(audit.metadata).toMatchObject({
      expectedUpdatedAt: before.updatedAt.toISOString(),
      billingProviderManaged: true,
      previous: { plan: "pro", status: "active", quantity: 2 },
      next: { plan: "enterprise", status: "pastDue", quantity: 3 },
    });

    const userBeforeStatus = await runWithoutTenant(() =>
      prisma.user.findUniqueOrThrow({ where: { id: target.userId } }),
    );
    const publishUserUpdated = vi.fn(() => Promise.resolve());
    await expect(
      runWithOperator(actor, () =>
        repo.updateUserStatusOrThrowUnscoped(
          {
            userId: target.userId,
            expectedUpdatedAt: userBeforeStatus.updatedAt.toISOString(),
            status: "inactive",
            reason: "Do not drift a provider-managed seat quantity",
            operationId: randomUUID(),
          },
          publishUserUpdated,
          now,
        ),
      ),
    ).rejects.toBeInstanceOf(OperatorConflictError);
    expect(publishUserUpdated).not.toHaveBeenCalled();
    await expect(
      runWithoutTenant(() => prisma.user.findUniqueOrThrow({ where: { id: target.userId } })),
    ).resolves.toMatchObject({ status: "active" });

    await expect(
      runWithOperator(actor, () =>
        repo.correctSubscriptionSnapshotOrThrowUnscoped(
          {
            userId: missing.userId,
            expectedUpdatedAt: now.toISOString(),
            plan: "pro",
            status: "active",
            quantity: 1,
            reason: "Do not create a missing subscription",
            operationId: randomUUID(),
          },
          now,
        ),
      ),
    ).rejects.toBeInstanceOf(OperatorNotFoundError);
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

    const initialCreditPosition = {
      expectedPeriodStart: periodStart.toISOString(),
      expectedPeriodEnd: periodEnd.toISOString(),
      expectedBaseAllowanceCredits: 10,
      expectedAdjustmentCredits: 4,
      expectedCommittedCredits: 6,
    };
    const staleRequests = [
      { ...initialCreditPosition, expectedPeriodStart: "2026-07-01T08:00:00.000Z" },
      { ...initialCreditPosition, expectedAdjustmentCredits: 3 },
      { ...initialCreditPosition, expectedCommittedCredits: 5 },
    ].map((position) => ({
      userId: target.userId,
      mode: "baseAllowance" as const,
      ...position,
      reason: "Reject a stale credit reset snapshot",
      operationId: randomUUID(),
    }));
    for (const request of staleRequests) {
      await expect(
        runWithOperator(actor, () => repo.resetUserCreditsOrThrowUnscoped(request, now)),
      ).rejects.toBeInstanceOf(OperatorConflictError);
    }
    await expect(
      runWithoutTenant(() =>
        prisma.agentCreditAdjustment.count({
          where: { operationId: { in: staleRequests.map(({ operationId }) => operationId) } },
        }),
      ),
    ).resolves.toBe(0);
    await expect(
      runWithoutTenant(() =>
        prisma.operatorAuditEvent.count({
          where: { operationId: { in: staleRequests.map(({ operationId }) => operationId) } },
        }),
      ),
    ).resolves.toBe(0);

    const staleBaseOperationId = randomUUID();
    await runWithoutTenant(() =>
      prisma.subscription.update({
        where: { companyId },
        data: { enterpriseAgentCreditsPerUser: 11 },
      }),
    );
    await expect(
      runWithOperator(actor, () =>
        repo.resetUserCreditsOrThrowUnscoped(
          {
            userId: target.userId,
            mode: "baseAllowance",
            ...initialCreditPosition,
            reason: "Reject a reset after the base allowance changed",
            operationId: staleBaseOperationId,
          },
          now,
        ),
      ),
    ).rejects.toBeInstanceOf(OperatorConflictError);
    await expect(
      runWithoutTenant(() => prisma.agentCreditAdjustment.findUnique({ where: { operationId: staleBaseOperationId } })),
    ).resolves.toBeNull();
    await expect(
      runWithoutTenant(() => prisma.operatorAuditEvent.findUnique({ where: { operationId: staleBaseOperationId } })),
    ).resolves.toBeNull();
    await runWithoutTenant(() =>
      prisma.subscription.update({
        where: { companyId },
        data: { enterpriseAgentCreditsPerUser: 10 },
      }),
    );

    const baseOperationId = randomUUID();
    const baseRequest = {
      userId: target.userId,
      mode: "baseAllowance" as const,
      ...initialCreditPosition,
      reason: "Return allowance to the contracted base",
      operationId: baseOperationId,
    };
    const base = await runWithOperator(actor, () => repo.resetUserCreditsOrThrowUnscoped(baseRequest, now));
    const baseReplay = await runWithOperator(actor, () => repo.resetUserCreditsOrThrowUnscoped(baseRequest, now));
    expect(base.adjustment.creditDelta).toBe(-4);
    expect(base.user.creditPeriod).toMatchObject({
      baseAllowanceCredits: 10,
      adjustmentCredits: 0,
      committedCredits: 6,
      remainingCredits: 4,
    });
    expect(baseReplay.adjustment).toEqual(base.adjustment);
    await expect(
      runWithOperator(actor, () =>
        repo.resetUserCreditsOrThrowUnscoped({ ...baseRequest, expectedBaseAllowanceCredits: 11 }, now),
      ),
    ).rejects.toBeInstanceOf(OperatorConflictError);
    await expect(
      runWithoutTenant(() => prisma.operatorAuditEvent.findUniqueOrThrow({ where: { operationId: baseOperationId } })),
    ).resolves.toMatchObject({
      metadata: expect.objectContaining({ expectedBaseAllowanceCredits: 10 }),
    });

    const zeroRequests = [randomUUID(), randomUUID()].map((operationId) => ({
      userId: target.userId,
      mode: "zeroBalance" as const,
      expectedPeriodStart: periodStart.toISOString(),
      expectedPeriodEnd: periodEnd.toISOString(),
      expectedBaseAllowanceCredits: 10,
      expectedAdjustmentCredits: 0,
      expectedCommittedCredits: 6,
      reason: "Set the remaining balance to zero",
      operationId,
    }));
    const outcomes = await Promise.allSettled(
      zeroRequests.map((request) => runWithOperator(actor, () => repo.resetUserCreditsOrThrowUnscoped(request, now))),
    );
    const fulfilled = outcomes.filter(
      (outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof repo.resetUserCreditsOrThrowUnscoped>>> =>
        outcome.status === "fulfilled",
    );
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: expect.any(OperatorConflictError),
    });
    expect(fulfilled[0].value.adjustment.creditDelta).toBe(-4);
    expect(fulfilled[0].value.user.creditPeriod).toMatchObject({
      effectiveAllowanceCredits: 6,
      committedCredits: 6,
      remainingCredits: 0,
      overageCredits: 0,
    });

    const winningOperationId = fulfilled[0].value.adjustment.operationId;
    const winningRequest = zeroRequests.find((request) => request.operationId === winningOperationId);
    if (!winningRequest) throw new Error("Expected a successful zero-balance request.");
    const zeroReplay = await runWithOperator(actor, () => repo.resetUserCreditsOrThrowUnscoped(winningRequest, now));
    expect(zeroReplay.adjustment).toEqual(fulfilled[0].value.adjustment);

    await expect(
      runWithOperator(actor, () =>
        repo.resetUserCreditsOrThrowUnscoped(
          {
            userId: target.userId,
            mode: "zeroBalance",
            expectedPeriodStart: periodStart.toISOString(),
            expectedPeriodEnd: periodEnd.toISOString(),
            expectedBaseAllowanceCredits: 10,
            expectedAdjustmentCredits: -4,
            expectedCommittedCredits: 6,
            reason: "Exercise the zero-balance no-op guard",
            operationId: randomUUID(),
          },
          now,
        ),
      ),
    ).rejects.toBeInstanceOf(OperatorConflictError);

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
          where: { operationId: baseOperationId },
        }),
      ),
    ).resolves.toBe(1);
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
        repo.resetUserCreditsOrThrowUnscoped(
          {
            userId: target.userId,
            mode: "baseAllowance",
            expectedPeriodStart: periodStart.toISOString(),
            expectedPeriodEnd: periodEnd.toISOString(),
            expectedBaseAllowanceCredits: 5,
            expectedAdjustmentCredits: 2,
            expectedCommittedCredits: 6,
            reason: "Exercise the committed lower bound",
            operationId,
          },
          now,
        ),
      ),
    ).rejects.toBeInstanceOf(OperatorConflictError);
    await expect(
      runWithoutTenant(() => prisma.agentCreditAdjustment.findUnique({ where: { operationId } })),
    ).resolves.toBeNull();
    await expect(
      runWithoutTenant(() => prisma.operatorAuditEvent.findUnique({ where: { operationId } })),
    ).resolves.toBeNull();
  });
});
