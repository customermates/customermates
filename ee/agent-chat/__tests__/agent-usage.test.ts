import { describe, expect, it, vi } from "vitest";

import { Status, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";
import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => ({
  env: {
    ...MOCK_ENV_MODULE.env,
    APP_MODE: "cloud",
    AGENT_MAX_STEPS: 8,
    AGENT_MAX_OUTPUT_TOKENS: 2048,
    OVH_AI_ENDPOINTS_API_KEY: "test-ovh-key" as string | undefined,
  },
}));

import { env } from "@/env";
import { AgentUsageService, AgentUsageViewSchema, toAgentUsageView } from "../agent-usage.service";
import { type AgentUsageRepo } from "@/ee/agent-chat/agent-usage.repo";
import { agentRoundWorstCaseMicrocents } from "../agent-budget-policy";
import { buildAgentUsageSettlement } from "../agent-usage-settlement";
import { computeCostMicrocents, promptTokensOf } from "../model-pricing";
import { SHIPPED_AGENT_MODEL } from "../model-catalog";

const MODEL = SHIPPED_AGENT_MODEL;
const CREDIT = 1_000_000;

const NOW = new Date("2026-08-06T12:00:00.000Z");
const ANCHOR = new Date("2026-01-15T10:30:00.000Z");

function makeRepo(
  overrides: {
    usedMicrocents?: number;
    poolUsedMicrocents?: number;
    unassignedMicrocents?: number;
    recentTurnMicrocents?: number | null;
    adjustmentMicrocents?: number;
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
        usedMicrocents: overrides.usedMicrocents ?? 0,
        recentTurnMicrocents: overrides.recentTurnMicrocents ?? null,
      }),
    ),
    getUserCreditAdjustmentUnscoped: vi.fn(() => Promise.resolve(overrides.adjustmentMicrocents ?? 0)),
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
    reserveUsageEventUnscoped: vi.fn(() => Promise.resolve(true)),
    releaseUsageReservationUnscoped: vi.fn(() => Promise.resolve()),
    admitsHostedAiRetrievalUnscoped: vi.fn(() => Promise.resolve(true)),
    getWorkspaceCreditPoolUnscoped: vi.fn(() =>
      Promise.resolve({
        plan: subscription.plan,
        subscriptionStatus: subscription.status,
        periodStart: new Date("2026-07-15T10:30:00.000Z"),
        periodEnd: new Date("2026-08-15T10:30:00.000Z"),
        limitMicrocents: 4_800 * CREDIT,
        usedMicrocents:
          overrides.poolUsedMicrocents ?? (overrides.usedMicrocents ?? 0) + (overrides.unassignedMicrocents ?? 0),
        unassignedMicrocents: overrides.unassignedMicrocents ?? 0,
        memberLimitMicrocents: {
          "user-1": 2_400 * CREDIT,
          "user-2": 2_400 * CREDIT,
        } as Record<string, number>,
        usable: true,
      }),
    ),
    accruePlatformUsageUnscoped: vi.fn(() => Promise.resolve()),
    reservePlatformUsageUnscoped: vi.fn(() => Promise.resolve("platform-hold")),
    settlePlatformUsageUnscoped: vi.fn(() => Promise.resolve()),
    settleStalePlatformReservationsUnscoped: vi.fn(() => Promise.resolve(0)),
    reserveRetrievalUsageUnscoped: vi.fn((): Promise<string | null> => Promise.resolve("hold-1")),
    settleRetrievalUsageUnscoped: vi.fn(() => Promise.resolve()),
    releaseStaleRetrievalReservationsUnscoped: vi.fn(() => Promise.resolve(0)),
  };
}

describe("AgentUsageService summary", () => {
  it("exposes exact microcent usage and billing-anniversary dates", async () => {
    const service = new AgentUsageService(makeRepo({ usedMicrocents: 493_827_156, recentTurnMicrocents: 753_412 }));

    const summary = await service.getUsageSummary("user-1", NOW);

    expect(summary).toEqual({
      creditsUsed: 493.827156,
      creditsRemaining: 1_906.172844,
      creditsLimit: 2_400,
      usedPct: 21,
      plan: SubscriptionPlan.pro,
      periodStart: new Date("2026-07-15T10:30:00.000Z"),
      resetAt: new Date("2026-08-15T10:30:00.000Z"),
      recentTurnCredits: 0.753412,
      usageMultiplier: 3,
      blockedReason: null,
    });
  });

  it("is not exhausted while a fraction of a credit remains", async () => {
    const service = new AgentUsageService(makeRepo({ usedMicrocents: 2_400 * CREDIT - 1 }));

    const summary = await service.getUsageSummary("user-1", NOW);

    expect(summary.creditsRemaining).toBe(0.000001);
    expect(summary.blockedReason).toBeNull();
  });

  it("clamps a downgrade immediately when prior-period usage exceeds the new ceiling", async () => {
    const service = new AgentUsageService(
      makeRepo({
        usedMicrocents: 1_000 * CREDIT,
        subscription: { plan: SubscriptionPlan.starter },
      }),
    );

    const summary = await service.getUsageSummary("user-1", NOW);

    expect(summary.creditsUsed).toBe(1_000);
    expect(summary.creditsLimit).toBe(800);
    expect(summary.creditsRemaining).toBe(0);
    expect(summary.usedPct).toBe(100);
    expect(summary.blockedReason).toBe("credits_exhausted");
  });

  it("gives live trial seats the full Pro-sized 3x allowance", async () => {
    const service = new AgentUsageService(
      makeRepo({
        usedMicrocents: CREDIT,
        user: { agentCreditActivatedAt: new Date("2026-08-06T11:00:00.000Z") },
        subscription: {
          status: SubscriptionStatus.trial,
          plan: SubscriptionPlan.starter,
          trialEndDate: new Date("2026-08-13T12:00:00.000Z"),
        },
      }),
    );

    const summary = await service.getUsageSummary("user-1", NOW);

    expect(summary.creditsLimit).toBe(2_400);
    expect(summary.creditsRemaining).toBe(2_399);
    expect(summary.usageMultiplier).toBe(3);
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
    expect(summary.blockedReason).toBe("configuration_unavailable");
  });

  it("applies a signed current-period adjustment to a live trial seat", async () => {
    const service = new AgentUsageService(
      makeRepo({
        adjustmentMicrocents: -25 * CREDIT,
        usedMicrocents: 100 * CREDIT,
        subscription: {
          status: SubscriptionStatus.trial,
          plan: SubscriptionPlan.starter,
          trialEndDate: new Date("2026-08-13T12:00:00.000Z"),
        },
      }),
    );

    await expect(service.getUsageSummary("user-1", NOW)).resolves.toMatchObject({
      creditsUsed: 100,
      creditsLimit: 2_375,
      creditsRemaining: 2_275,
      blockedReason: null,
    });
  });

  it("includes current-period manual adjustments without exposing their reasons", async () => {
    const service = new AgentUsageService(
      makeRepo({
        usedMicrocents: 100 * CREDIT,
        adjustmentMicrocents: 75 * CREDIT,
      }),
    );

    const summary = await service.getUsageSummary("user-1", NOW);

    expect(summary).toMatchObject({
      creditsUsed: 100,
      creditsLimit: 2_475,
      creditsRemaining: 2_375,
    });
    expect(summary).not.toHaveProperty("adjustments");
    expect(summary).not.toHaveProperty("reason");
  });

  it("does not grant a hosted allowance to an inactive user", async () => {
    const service = new AgentUsageService(
      makeRepo({
        usedMicrocents: 12 * CREDIT,
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

describe("AgentUsageService retrieval refusal", () => {
  it("labels exhausted allowance as credits", async () => {
    const service = new AgentUsageService(makeRepo({ usedMicrocents: 2_400 * CREDIT }));
    await expect(service.retrievalRefusal("user-1", CREDIT, NOW)).resolves.toBe("credits");
  });

  it("labels a reservation larger than the remaining headroom as credits", async () => {
    const service = new AgentUsageService(makeRepo({ usedMicrocents: 2_399 * CREDIT }));
    await expect(service.retrievalRefusal("user-1", 2 * CREDIT, NOW)).resolves.toBe("credits");
  });

  it("labels an unavailable subscription as unavailable, not credits", async () => {
    const service = new AgentUsageService(
      makeRepo({ user: { status: Status.inactive, agentCreditActivatedAt: null } }),
    );
    await expect(service.retrievalRefusal("user-1", CREDIT, NOW)).resolves.toBe("unavailable");
  });

  it("labels paused provider work or the platform cap as unavailable while credits remain", async () => {
    const repo = makeRepo();
    repo.admitsHostedAiRetrievalUnscoped.mockResolvedValue(false);
    await expect(new AgentUsageService(repo).retrievalRefusal("user-1", CREDIT, NOW)).resolves.toBe("unavailable");
  });

  it("labels a refusal with headroom left as unavailable", async () => {
    const service = new AgentUsageService(makeRepo());
    await expect(service.retrievalRefusal("user-1", CREDIT, NOW)).resolves.toBe("unavailable");
  });
});

describe("AgentUsageService admission and ledger", () => {
  it("admits and bounds a final fully reservable turn", async () => {
    const required = agentRoundWorstCaseMicrocents(MODEL);
    const service = new AgentUsageService(makeRepo({ usedMicrocents: 2_400 * CREDIT - required }));

    const admission = await service.prepareTurn("user-1", NOW, {
      model: MODEL,
    });

    expect(admission.summary.creditsRemaining).toBe(required / CREDIT);
    expect(admission.reservation?.reservedMicrocents).toBe(required);
  });

  it("does not start a round when the remaining credits cannot cover its hard provider ceiling", async () => {
    const required = agentRoundWorstCaseMicrocents(MODEL);
    const service = new AgentUsageService(makeRepo({ usedMicrocents: 2_400 * CREDIT - required + 1 }));

    const admission = await service.prepareTurn("user-1", NOW, {
      model: MODEL,
    });

    expect(admission.summary.creditsRemaining).toBe((required - 1) / CREDIT);
    expect(admission.summary.blockedReason).toBe("credits_exhausted");
    expect(admission.reservation).toBeNull();
  });

  it.each([undefined, "", "XXX"])(
    "fails closed before reserving an OVH-served turn when the OVH key is %j",
    async (apiKey) => {
      const repo = makeRepo({ usedMicrocents: 100 * CREDIT });
      const service = new AgentUsageService(repo);
      const configuredKey = env.OVH_AI_ENDPOINTS_API_KEY;
      env.OVH_AI_ENDPOINTS_API_KEY = apiKey;
      try {
        const admission = await service.prepareTurn("user-1", NOW, { model: MODEL });

        expect(admission.summary.blockedReason).toBe("configuration_unavailable");
        expect(admission.reservation).toBeNull();
        expect(repo.reserveUsageEventUnscoped).not.toHaveBeenCalled();
      } finally {
        env.OVH_AI_ENDPOINTS_API_KEY = configuredKey;
      }
    },
  );

  it("reports hosted Mate as not configured in the usage summary and view when the OVH key is missing", async () => {
    const service = new AgentUsageService(makeRepo({ usedMicrocents: 100 * CREDIT }));
    const configuredKey = env.OVH_AI_ENDPOINTS_API_KEY;
    try {
      env.OVH_AI_ENDPOINTS_API_KEY = undefined;
      const missing = await service.getUsageSummary("user-1", NOW);
      expect(missing.blockedReason).toBe("configuration_unavailable");
      expect(toAgentUsageView(missing).blockedReason).toBe("configuration_unavailable");

      env.OVH_AI_ENDPOINTS_API_KEY = "test-ovh-key";
      expect((await service.getUsageSummary("user-1", NOW)).blockedReason).toBeNull();
    } finally {
      env.OVH_AI_ENDPOINTS_API_KEY = configuredKey;
    }
  });

  it("keeps an exhausted allowance as the reported reason when the OVH key is also missing", async () => {
    const service = new AgentUsageService(makeRepo({ usedMicrocents: 2_400 * CREDIT }));
    const configuredKey = env.OVH_AI_ENDPOINTS_API_KEY;
    env.OVH_AI_ENDPOINTS_API_KEY = undefined;
    try {
      expect((await service.getUsageSummary("user-1", NOW)).blockedReason).toBe("credits_exhausted");
    } finally {
      env.OVH_AI_ENDPOINTS_API_KEY = configuredKey;
    }
  });

  it("still admits a Gateway-served model without the OVH key", async () => {
    const service = new AgentUsageService(makeRepo({ usedMicrocents: 100 * CREDIT }));
    const configuredKey = env.OVH_AI_ENDPOINTS_API_KEY;
    env.OVH_AI_ENDPOINTS_API_KEY = undefined;
    try {
      const admission = await service.prepareTurn("user-1", NOW, {
        model: { ...MODEL, modelId: "google/gemini-3.5-flash", servingProvider: "vertex" },
      });

      expect(admission.summary.blockedReason).toBeNull();
      expect(admission.reservation).not.toBeNull();
    } finally {
      env.OVH_AI_ENDPOINTS_API_KEY = configuredKey;
    }
  });

  it("does not reserve when the allowance is exhausted", async () => {
    const service = new AgentUsageService(makeRepo({ usedMicrocents: 2_400 * CREDIT }));

    const admission = await service.prepareTurn("user-1", NOW, {
      model: MODEL,
    });

    expect(admission.summary.blockedReason).toBe("credits_exhausted");
    expect(admission.reservation).toBeNull();
  });

  it("persists reservation units and entitlement snapshots", async () => {
    const repo = makeRepo({ usedMicrocents: 100 * CREDIT });
    const service = new AgentUsageService(repo);
    const admission = await service.prepareTurn("user-1", NOW, {
      model: MODEL,
    });
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
        reservedMicrocents: admission.reservation?.reservedMicrocents,
        planSnapshot: SubscriptionPlan.pro,
        subscriptionStatusSnapshot: SubscriptionStatus.active,
        allowanceMicrocentsSnapshot: 2_400 * CREDIT,
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
      reservedMicrocents: 2 * CREDIT,
      providerCharge: {
        billed: true,
        measuredCostMicrocents: null,
        stepTokens: [],
        unreadableReason: "test",
      },
    });

    expect(settlement.policyBreach).toBe(true);
    expect(settlement.chargedMicrocents).toBe(2 * CREDIT);
    expect(settlement.state).toBe("settled");
  });

  it("releases the reservation when the gateway proves the provider never billed", () => {
    const settlement = buildAgentUsageSettlement({
      model: "openai/gpt-5-nano",
      tokens: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      reservedMicrocents: 14 * CREDIT,
      providerCharge: {
        billed: false,
        measuredCostMicrocents: null,
        stepTokens: [],
        unreadableReason: null,
      },
    });

    expect(settlement).toMatchObject({
      chargedMicrocents: 0,
      costMicrocents: 0,
      costSource: "measured",
      policyBreach: false,
      state: "settled",
    });
  });

  it("charges the gateway's measured cost rather than the pinned estimate", () => {
    const settlement = buildAgentUsageSettlement({
      model: "openai/gpt-5-nano",
      provider: "azure",
      tokens: {
        inputTokens: 35_329,
        outputTokens: 2_945,
        cacheReadTokens: 73_728,
        cacheWriteTokens: 0,
      },
      reservedMicrocents: 14 * CREDIT,
      providerCharge: {
        billed: true,
        measuredCostMicrocents: 2_000_001,
        stepTokens: [],
        unreadableReason: null,
      },
    });

    expect(settlement).toMatchObject({
      costMicrocents: 2_000_001,
      costSource: "measured",
      chargedMicrocents: 2_000_001,
      state: "settled",
    });
  });

  it("adds classifier charges to the measured turn cost as one auxiliary amount", () => {
    const settlement = buildAgentUsageSettlement({
      model: "openai/gpt-5-nano",
      provider: "azure",
      tokens: {
        inputTokens: 10,
        outputTokens: 10,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      reservedMicrocents: 14 * CREDIT,
      providerCharge: {
        billed: true,
        measuredCostMicrocents: 999_000,
        stepTokens: [],
        unreadableReason: null,
      },
      auxiliary: { costMicrocents: 2_000, measured: true },
    });

    expect(settlement).toMatchObject({
      costMicrocents: 1_001_000,
      costSource: "measured",
      chargedMicrocents: 1_001_000,
    });
  });

  it("marks the turn cost estimated when a classifier charge was estimated", () => {
    const settlement = buildAgentUsageSettlement({
      model: "openai/gpt-5-nano",
      provider: "azure",
      tokens: {
        inputTokens: 10,
        outputTokens: 10,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      reservedMicrocents: 14 * CREDIT,
      providerCharge: {
        billed: true,
        measuredCostMicrocents: 1_000,
        stepTokens: [],
        unreadableReason: null,
      },
      auxiliary: { costMicrocents: 500, measured: false },
    });

    expect(settlement).toMatchObject({
      costMicrocents: 1_500,
      costSource: "estimated",
    });
  });

  it("charges a classifier call even when no provider round was billed", () => {
    const settlement = buildAgentUsageSettlement({
      model: "openai/gpt-5-nano",
      tokens: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      reservedMicrocents: 14 * CREDIT,
      providerCharge: {
        billed: false,
        measuredCostMicrocents: null,
        stepTokens: [],
        unreadableReason: null,
      },
      auxiliary: { costMicrocents: 1_600, measured: true },
    });

    expect(settlement).toMatchObject({
      costMicrocents: 1_600,
      costSource: "measured",
      chargedMicrocents: 1_600,
    });
  });

  it("rejects a negative or fractional auxiliary cost", () => {
    for (const costMicrocents of [-1, 1.5]) {
      expect(() =>
        buildAgentUsageSettlement({
          model: "openai/gpt-5-nano",
          tokens: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          reservedMicrocents: 14 * CREDIT,
          providerCharge: {
            billed: false,
            measuredCostMicrocents: null,
            stepTokens: [],
            unreadableReason: null,
          },
          auxiliary: { costMicrocents, measured: true },
        }),
      ).toThrow(/auxiliary usage cost/);
    }
  });

  it("quarantines an unreadable cost against the pinned estimate instead of throwing", () => {
    const settlement = buildAgentUsageSettlement({
      model: "openai/gpt-5-nano",
      provider: "azure",
      tokens: {
        inputTokens: 35_329,
        outputTokens: 2_945,
        cacheReadTokens: 73_728,
        cacheWriteTokens: 0,
      },
      reservedMicrocents: 14 * CREDIT,
      providerCharge: {
        billed: true,
        measuredCostMicrocents: null,
        stepTokens: [],
        unreadableReason: "no usable cost figure",
      },
    });

    expect(settlement).toMatchObject({
      costMicrocents: 368_173,
      costSource: "estimated",
      state: "settled",
    });
  });

  it.each([null, 2_000_001])(
    "preserves known charges in a mixed estimate, preferring measured total %s",
    (measured) => {
      const settlement = buildAgentUsageSettlement({
        model: "openai/gpt-5-nano",
        tokens: {
          inputTokens: 1,
          outputTokens: 1,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        reservedMicrocents: 10 * CREDIT,
        providerCharge: {
          billed: true,
          measuredCostMicrocents: measured,
          estimatedCostMicrocents: 1_080_587,
          stepTokens: [],
          unreadableReason: measured === null ? "missing later-round metadata" : null,
        },
      });

      expect(settlement).toMatchObject({
        costMicrocents: measured ?? 1_080_587,
        costSource: measured === null ? "estimated" : "measured",
        chargedMicrocents: measured ?? 1_080_587,
        policyBreach: false,
      });
    },
  );

  it.each([-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects an invalid mixed-round estimate %s",
    (estimatedCostMicrocents) => {
      expect(() =>
        buildAgentUsageSettlement({
          model: "openai/gpt-5-nano",
          tokens: {
            inputTokens: 1,
            outputTokens: 1,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          reservedMicrocents: 10 * CREDIT,
          providerCharge: {
            billed: true,
            measuredCostMicrocents: null,
            estimatedCostMicrocents,
            stepTokens: [],
            unreadableReason: "missing later-round metadata",
          },
        }),
      ).toThrow("non-negative whole number of microcents");
    },
  );

  it("prices a multi-step turn per request, as the provider bills it, not on the turn aggregate", () => {
    const steps = [
      {
        inputTokens: 27,
        outputTokens: 251,
        cacheReadTokens: 143_000,
        cacheWriteTokens: 37_210,
      },
      {
        inputTokens: 0,
        outputTokens: 276,
        cacheReadTokens: 144_247,
        cacheWriteTokens: 0,
      },
    ];
    const aggregate = {
      inputTokens: 27,
      outputTokens: 527,
      cacheReadTokens: 287_247,
      cacheWriteTokens: 37_210,
    };

    expect(promptTokensOf(aggregate)).toBeGreaterThan(272_000);
    for (const step of steps) expect(promptTokensOf(step)).toBeLessThan(272_000);

    const settlement = buildAgentUsageSettlement({
      model: "openai/gpt-5.6-luna",
      provider: "azure",
      tokens: aggregate,
      reservedMicrocents: 40 * CREDIT,
      providerCharge: {
        billed: true,
        measuredCostMicrocents: null,
        stepTokens: steps,
        unreadableReason: "test",
      },
    });

    expect(settlement.costMicrocents).toBe(1_568_524);
    expect(computeCostMicrocents("openai/gpt-5.6-luna", aggregate, "azure")).toBe(3_105_428);
    expect(settlement.chargedMicrocents).toBe(1_568_524);
  });

  it("charges the exact cache-write cost, not a rounded-up second credit", () => {
    const settlement = buildAgentUsageSettlement({
      model: "gpt-5.6-luna",
      tokens: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 40_001,
      },
      reservedMicrocents: 44 * CREDIT,
      providerCharge: {
        billed: true,
        measuredCostMicrocents: null,
        stepTokens: [],
        unreadableReason: "test",
      },
    });

    expect(settlement.costMicrocents).toBe(1_000_025);
    expect(settlement.chargedMicrocents).toBe(1_000_025);
    expect(settlement.policyBreach).toBe(false);
  });

  it("charges a typical $0.0075 turn exactly 0.75 credits, with no minimum of one", () => {
    const settlement = buildAgentUsageSettlement({
      model: MODEL.modelId,
      provider: MODEL.servingProvider,
      tokens: {
        inputTokens: 10,
        outputTokens: 10,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      reservedMicrocents: 11 * CREDIT,
      providerCharge: {
        billed: true,
        measuredCostMicrocents: 750_000,
        stepTokens: [],
        unreadableReason: null,
      },
    });
    const tiny = buildAgentUsageSettlement({
      model: MODEL.modelId,
      provider: MODEL.servingProvider,
      tokens: {
        inputTokens: 1,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      reservedMicrocents: 11 * CREDIT,
      providerCharge: {
        billed: true,
        measuredCostMicrocents: 37,
        stepTokens: [],
        unreadableReason: null,
      },
    });

    expect(settlement).toMatchObject({
      costMicrocents: 750_000,
      chargedMicrocents: 750_000,
      policyBreach: false,
    });
    expect(tiny).toMatchObject({ costMicrocents: 37, chargedMicrocents: 37 });
  });

  it("flags a policy breach on the exact cost, a microcent above the reservation", () => {
    const settlement = buildAgentUsageSettlement({
      model: MODEL.modelId,
      tokens: {
        inputTokens: 1,
        outputTokens: 1,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      reservedMicrocents: 5_602_300,
      providerCharge: {
        billed: true,
        measuredCostMicrocents: 5_602_301,
        stepTokens: [],
        unreadableReason: null,
      },
    });

    expect(settlement).toMatchObject({
      chargedMicrocents: 5_602_300,
      policyBreach: true,
    });
  });

  it("grants Wiki indexing to the workspace while its pooled allowance has headroom", async () => {
    const repo = makeRepo({ usedMicrocents: 4_799 * CREDIT });
    const service = new AgentUsageService(repo);

    await expect(service.prepareWorkspaceIndexing("company-1", NOW)).resolves.toEqual({
      purpose: "wikiIndexing",
      companyId: "company-1",
      userId: null,
      planSnapshot: SubscriptionPlan.pro,
      subscriptionStatusSnapshot: SubscriptionStatus.active,
      allowanceMicrocentsSnapshot: 4_800 * CREDIT,
      periodStart: new Date("2026-07-15T10:30:00.000Z"),
      periodEnd: new Date("2026-08-15T10:30:00.000Z"),
    });
    expect(repo.getWorkspaceCreditPoolUnscoped).toHaveBeenCalledWith("company-1", NOW);
    expect(repo.findUserForUsageUnscoped).not.toHaveBeenCalled();
  });

  it("stops Wiki indexing once the workspace has committed its pooled allowance", async () => {
    const exhausted = new AgentUsageService(makeRepo({ usedMicrocents: 4_800 * CREDIT }));
    await expect(exhausted.prepareWorkspaceIndexing("company-1", NOW)).resolves.toBeNull();

    const unusable = makeRepo();
    unusable.getWorkspaceCreditPoolUnscoped.mockResolvedValueOnce({
      plan: SubscriptionPlan.pro,
      subscriptionStatus: SubscriptionStatus.cancelled,
      periodStart: NOW,
      periodEnd: NOW,
      limitMicrocents: 0,
      usedMicrocents: 0,
      unassignedMicrocents: 0,
      memberLimitMicrocents: {},
      usable: false,
    });
    await expect(new AgentUsageService(unusable).prepareWorkspaceIndexing("company-1", NOW)).resolves.toBeNull();
  });

  it("gives a search query grant to the person searching", async () => {
    const grant = await new AgentUsageService(makeRepo()).prepareRetrieval("user-1", NOW);

    expect(grant).toMatchObject({
      purpose: "wikiRetrieval",
      companyId: "company-1",
      userId: "user-1",
      allowanceMicrocentsSnapshot: 2_400 * CREDIT,
    });
  });

  it("reserves an embedding's worst case, settles its exact cost, and refuses a grant whose payer does not match its purpose", async () => {
    const repo = makeRepo();
    const service = new AgentUsageService(repo);
    const grant = await service.prepareWorkspaceIndexing("company-1", NOW);
    if (!grant) throw new Error("Expected a workspace indexing grant.");
    const charge = {
      model: "embedding",
      inputTokens: 3,
      costMicrocents: 37,
      costSource: "measured" as const,
    };

    const reservation = await service.reserveRetrieval({
      grant,
      worstCaseMicrocents: 90,
      model: "embedding",
      now: NOW,
    });
    expect(reservation).toEqual({
      id: "hold-1",
      grant,
      reservedMicrocents: 90,
      reservedAt: NOW,
    });
    expect(repo.reserveRetrievalUsageUnscoped).toHaveBeenCalledWith({
      grant,
      reservedMicrocents: 90,
      model: "embedding",
      now: NOW,
    });
    if (!reservation) throw new Error("Expected a reservation.");
    await service.settleRetrieval({ reservation, charge, now: NOW });
    expect(repo.settleRetrievalUsageUnscoped).toHaveBeenCalledWith({
      grant,
      reservationId: "hold-1",
      reservedMicrocents: 90,
      reservedAt: NOW,
      charge,
      payer: "grant",
      now: NOW,
    });
    await service.settleRetrieval({
      reservation,
      charge,
      payer: "platform",
      now: NOW,
    });
    expect(repo.settleRetrievalUsageUnscoped).toHaveBeenLastCalledWith(
      expect.objectContaining({
        reservationId: "hold-1",
        charge,
        payer: "platform",
      }),
    );

    repo.reserveRetrievalUsageUnscoped.mockResolvedValueOnce(null);
    await expect(
      service.reserveRetrieval({
        grant,
        worstCaseMicrocents: 90,
        model: "embedding",
      }),
    ).resolves.toBeNull();
    await expect(
      service.reserveRetrieval({
        grant: { ...grant, userId: "user-1" },
        worstCaseMicrocents: 90,
        model: "embedding",
      }),
    ).rejects.toThrow("Retrieval grant payer is invalid.");
  });

  it("releases retrieval reservations older than their time to live", async () => {
    const repo = makeRepo();
    repo.releaseStaleRetrievalReservationsUnscoped.mockResolvedValueOnce(2);

    await expect(new AgentUsageService(repo).releaseStaleRetrievalReservations(NOW)).resolves.toBe(2);
    expect(repo.releaseStaleRetrievalReservationsUnscoped).toHaveBeenCalledWith({
      reservedBefore: new Date(NOW.getTime() - 15 * 60 * 1000),
      now: NOW,
    });
  });

  it("settles interrupted platform reservations after the retrieval time to live", async () => {
    const repo = makeRepo();
    repo.settleStalePlatformReservationsUnscoped.mockResolvedValueOnce(2);
    await expect(new AgentUsageService(repo).settleStalePlatformReservations(NOW)).resolves.toBe(2);
    expect(repo.settleStalePlatformReservationsUnscoped).toHaveBeenCalledWith({
      reservedBefore: new Date(NOW.getTime() - 15 * 60 * 1000),
      now: NOW,
    });
  });

  it("accrues platform documentation indexing without charging any member", async () => {
    const repo = makeRepo();
    const charge = {
      model: "embedding",
      inputTokens: 40,
      costMicrocents: 600,
      costSource: "measured" as const,
    };
    await new AgentUsageService(repo).accruePlatformUsage({
      purpose: "docsIndexing",
      charge,
      now: NOW,
    });

    expect(repo.accruePlatformUsageUnscoped).toHaveBeenCalledWith({
      purpose: "docsIndexing",
      charge,
      now: NOW,
    });
    expect(repo.reserveRetrievalUsageUnscoped).not.toHaveBeenCalled();
    expect(repo.reserveUsageEventUnscoped).not.toHaveBeenCalled();
  });

  it("counts a member's allowance-weighted share of workspace indexing as their own usage", async () => {
    const summary = await new AgentUsageService(
      makeRepo({
        usedMicrocents: 10 * CREDIT,
        unassignedMicrocents: 100 * CREDIT,
      }),
    ).getUsageSummary("user-1", NOW);

    expect(summary).toMatchObject({
      creditsUsed: 60,
      creditsRemaining: 2_340,
      creditsLimit: 2_400,
    });
  });

  it("never offers a member more than the workspace pool has left", async () => {
    const summary = await new AgentUsageService(
      makeRepo({ usedMicrocents: 0, poolUsedMicrocents: 4_790 * CREDIT }),
    ).getUsageSummary("user-1", NOW);

    expect(summary).toMatchObject({
      creditsUsed: 0,
      creditsRemaining: 10,
      creditsLimit: 2_400,
    });
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

describe("toAgentUsageView", () => {
  const summary = {
    creditsUsed: 123.456789,
    creditsRemaining: 476.543211,
    creditsLimit: 600,
    usedPct: 21,
    plan: SubscriptionPlan.pro,
    periodStart: new Date("2026-07-15T10:30:00.000Z"),
    resetAt: new Date("2026-08-15T10:30:00.000Z"),
    recentTurnCredits: 0.753412,
    usageMultiplier: 3,
    blockedReason: null,
  };

  it("gives the browser shares of the allowance and the plan multiple, never raw credit amounts", () => {
    const view = toAgentUsageView(summary);

    expect(view).toEqual({
      hasAllowance: true,
      usedPct: 20.58,
      multiplier: 3,
      plan: SubscriptionPlan.pro,
      resetAt: new Date("2026-08-15T10:30:00.000Z"),
      recentTurnPct: 0.13,
      blockedReason: null,
    });
    expect(AgentUsageViewSchema.parse(view)).toEqual(view);
    expect(Object.keys(view).filter((key) => /credit/i.test(key))).toEqual([]);
    expect(JSON.stringify(view)).not.toMatch(/123\.45|476\.54|"600"|:600\b|0\.7534/);
  });

  it("keeps a tiny non-zero turn visible and hides the share without an allowance", () => {
    expect(toAgentUsageView({ ...summary, recentTurnCredits: 0.000001 }).recentTurnPct).toBe(0.01);
    expect(toAgentUsageView({ ...summary, creditsUsed: 900 }).usedPct).toBe(100);
    expect(
      toAgentUsageView({ ...summary, creditsLimit: 0, creditsRemaining: 0, blockedReason: "subscription_unavailable" }),
    ).toMatchObject({ hasAllowance: false, usedPct: 0, recentTurnPct: null });
  });
});
