import { describe, expect, it, vi } from "vitest";

import { Status, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";
import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => ({
  env: {
    ...MOCK_ENV_MODULE.env,
    APP_MODE: "cloud",
    AGENT_MAX_STEPS: 8,
    AGENT_MAX_OUTPUT_TOKENS: 2048,
  },
}));

import { AgentUsageService, type AgentUsageRepo } from "../agent-usage.service";
import { buildAgentUsageSettlement } from "../agent-usage-settlement";
import { MODEL_CATALOG } from "../model-catalog";

const MODEL = MODEL_CATALOG.balanced;

const NOW = new Date("2026-08-06T12:00:00.000Z");
const ANCHOR = new Date("2026-01-15T10:30:00.000Z");

function makeRepo(
  overrides: {
    usedCredits?: number;
    recentTurnCredits?: number | null;
    user?: Partial<NonNullable<Awaited<ReturnType<AgentUsageRepo["findUserForUsageUnscoped"]>>>>;
    subscription?: Partial<
      NonNullable<Awaited<ReturnType<AgentUsageRepo["findUserForUsageUnscoped"]>>>["subscription"]
    >;
  } = {},
) {
  const subscription = {
    status: SubscriptionStatus.active,
    plan: SubscriptionPlan.pro,
    trialEndDate: null,
    agentCreditAnchorAt: ANCHOR,
    enterpriseAgentCreditsPerUser: null,
    createdAt: ANCHOR,
    ...overrides.subscription,
  };
  return {
    getUserCreditUsageUnscoped: vi.fn(() =>
      Promise.resolve({
        usedCredits: overrides.usedCredits ?? 0,
        recentTurnCredits: overrides.recentTurnCredits ?? null,
      }),
    ),
    findUserForUsageUnscoped: vi.fn(() =>
      Promise.resolve({
        id: "user-1",
        companyId: "company-1",
        status: Status.active,
        createdAt: ANCHOR,
        agentCreditActivatedAt: ANCHOR,
        subscription,
        ...overrides.user,
      }),
    ),
    recordUsageEventUnscoped: vi.fn(() => Promise.resolve()),
    reserveUsageEventUnscoped: vi.fn(() => Promise.resolve()),
    releaseUsageReservationUnscoped: vi.fn(() => Promise.resolve()),
  };
}

describe("AgentUsageService summary", () => {
  it("exposes only whole-credit monthly usage and billing-anniversary dates", async () => {
    const service = new AgentUsageService(makeRepo({ usedCredits: 123, recentTurnCredits: 2 }));

    const summary = await service.getUsageSummary("user-1", NOW);

    expect(summary).toEqual({
      creditsUsed: 123,
      creditsRemaining: 377,
      creditsLimit: 500,
      usedPct: 25,
      plan: SubscriptionPlan.pro,
      periodStart: new Date("2026-07-15T10:30:00.000Z"),
      resetAt: new Date("2026-08-15T10:30:00.000Z"),
      recentTurnCredits: 2,
      blockedReason: null,
    });
  });

  it("clamps a downgrade immediately when prior-period usage exceeds the new ceiling", async () => {
    const service = new AgentUsageService(
      makeRepo({
        usedCredits: 250,
        subscription: { plan: SubscriptionPlan.starter },
      }),
    );

    const summary = await service.getUsageSummary("user-1", NOW);

    expect(summary.creditsUsed).toBe(250);
    expect(summary.creditsLimit).toBe(200);
    expect(summary.creditsRemaining).toBe(0);
    expect(summary.usedPct).toBe(100);
    expect(summary.blockedReason).toBe("credits_exhausted");
  });

  it("gives live trial seats the full 500-credit allowance", async () => {
    const service = new AgentUsageService(
      makeRepo({
        usedCredits: 1,
        user: { agentCreditActivatedAt: new Date("2026-08-06T11:00:00.000Z") },
        subscription: {
          status: SubscriptionStatus.trial,
          plan: SubscriptionPlan.starter,
          trialEndDate: new Date("2026-08-13T12:00:00.000Z"),
        },
      }),
    );

    const summary = await service.getUsageSummary("user-1", NOW);

    expect(summary.creditsLimit).toBe(500);
    expect(summary.creditsRemaining).toBe(499);
  });

  it("fails closed for Enterprise without an internal allowance", async () => {
    const service = new AgentUsageService(
      makeRepo({
        subscription: {
          plan: SubscriptionPlan.enterprise,
          enterpriseAgentCreditsPerUser: null,
        },
      }),
    );

    const summary = await service.getUsageSummary("user-1", NOW);

    expect(summary.creditsLimit).toBe(0);
    expect(summary.usedPct).toBe(0);
    expect(summary.blockedReason).toBe("enterprise_allowance_missing");
  });

  it("does not grant a hosted allowance to an inactive user", async () => {
    const service = new AgentUsageService(
      makeRepo({
        usedCredits: 12,
        user: { status: Status.inactive, agentCreditActivatedAt: null },
      }),
    );

    const summary = await service.getUsageSummary("user-1", NOW);

    expect(summary).toMatchObject({
      creditsUsed: 12,
      creditsRemaining: 0,
      creditsLimit: 0,
      usedPct: 0,
      blockedReason: "subscription_unavailable",
    });
  });

  it("shows an unavailable zero allowance without presenting it as fully consumed", async () => {
    const service = new AgentUsageService(makeRepo({ user: { subscription: null } }));

    const summary = await service.getUsageSummary("user-1", NOW);

    expect(summary).toMatchObject({
      creditsUsed: 0,
      creditsRemaining: 0,
      creditsLimit: 0,
      usedPct: 0,
      plan: null,
      blockedReason: "subscription_unavailable",
    });
  });

  it("starts trial-to-paid accounting from the fresh paid anchor", async () => {
    const repo = makeRepo({
      subscription: {
        status: SubscriptionStatus.active,
        agentCreditAnchorAt: new Date("2026-08-06T09:00:00.000Z"),
      },
    });
    const service = new AgentUsageService(repo);

    await service.getUsageSummary("user-1", NOW);

    expect(repo.getUserCreditUsageUnscoped).toHaveBeenCalledWith(
      "company-1",
      "user-1",
      new Date("2026-08-06T09:00:00.000Z"),
      new Date("2026-09-06T09:00:00.000Z"),
    );
  });
});

describe("AgentUsageService admission and ledger", () => {
  it("admits and bounds a final one-credit turn", async () => {
    const service = new AgentUsageService(makeRepo({ usedCredits: 499 }));

    const admission = await service.prepareTurn("user-1", NOW, { model: MODEL });

    expect(admission.summary.creditsRemaining).toBe(1);
    expect(admission.reservation?.reservedCredits).toBe(1);
    expect(admission.reservation?.budget.maxSteps).toBeGreaterThanOrEqual(1);
  });

  it("does not reserve when the allowance is exhausted", async () => {
    const service = new AgentUsageService(makeRepo({ usedCredits: 500 }));

    const admission = await service.prepareTurn("user-1", NOW, { model: MODEL });

    expect(admission.summary.blockedReason).toBe("credits_exhausted");
    expect(admission.reservation).toBeNull();
  });

  it("persists reservation units and entitlement snapshots", async () => {
    const repo = makeRepo({ usedCredits: 100 });
    const service = new AgentUsageService(repo);
    const admission = await service.prepareTurn("user-1", NOW, { model: MODEL });
    expect(admission.reservation).not.toBeNull();
    if (!admission.reservation) throw new Error("Expected an AI credit reservation.");

    await service.reserveUsage({
      reservationId: "run-1",
      companyId: "company-1",
      userId: "user-1",
      reservation: admission.reservation,
    });

    expect(repo.reserveUsageEventUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "run-1",
        sessionId: "run-1",
        reservedCredits: admission.reservation?.reservedCredits,
        planSnapshot: SubscriptionPlan.pro,
        subscriptionStatusSnapshot: SubscriptionStatus.active,
        allowanceCreditsSnapshot: 500,
        periodStart: new Date("2026-07-15T10:30:00.000Z"),
        periodEnd: new Date("2026-08-15T10:30:00.000Z"),
      }),
    );
  });

  it("never charges beyond the bounded reservation when reported usage exceeds the model budget", () => {
    const settlement = buildAgentUsageSettlement({
      model: "gpt-5.6-luna",
      tokens: {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      reservedCredits: 2,
      retainReservation: false,
    });

    expect(settlement.policyBreach).toBe(true);
    expect(settlement.chargedCredits).toBe(2);
    expect(settlement.state).toBe("settled");
  });

  it("charges two credits once cache-write cost crosses one cent", () => {
    const settlement = buildAgentUsageSettlement({
      model: "gpt-5.6-luna",
      tokens: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 40_001,
      },
      reservedCredits: 44,
      retainReservation: false,
    });

    expect(settlement.costMicrocents).toBe(1_000_025);
    expect(settlement.chargedCredits).toBe(2);
    expect(settlement.policyBreach).toBe(false);
  });

  it("keeps a zero-credit released ledger row for pre-provider failures", async () => {
    const repo = makeRepo();
    const service = new AgentUsageService(repo);

    await service.releaseReservation({
      reservationId: "run-1",
      companyId: "company-1",
      userId: "user-1",
      now: NOW,
    });

    expect(repo.releaseUsageReservationUnscoped).toHaveBeenCalledWith({
      id: "run-1",
      companyId: "company-1",
      userId: "user-1",
      releasedAt: NOW,
    });
  });
});
