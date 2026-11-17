import { describe, expect, it, vi } from "vitest";

import type { AgentTurnBudget } from "@/ee/agent-chat/agent-budget-policy";
import type { AgentJobStepUsage } from "../run-agent-job-loop";

import { MateAgentJobCredits, mateJobReservationId } from "../mate-agent-job-credits";
import { buildMateJobSettlement, mateJobOutOfBudget, mateStepCost, sumStepTokens } from "../mate-agent-job-settlement";

const BUDGET: AgentTurnBudget = {
  modelSpec: "anthropic/claude-haiku-5.5",
  servingProvider: "vertexAnthropic",
  inferenceRegion: "eu",
  reservedMicrocents: 1_000_000,
  roundReserveMicrocents: 300_000,
  maxOutputTokens: 8192,
  maxContextTokens: 65_000,
  maxContextBytes: 195_000,
  maxToolResultChars: 6000,
};

function billedMetadata(cost: string) {
  return {
    gateway: {
      routing: {
        finalProvider: "vertexAnthropic",
        modelAttempts: [
          {
            success: true,
            providerAttempts: [{ provider: "vertexAnthropic", credentialType: "system", success: true }],
          },
        ],
      },
      surchargeCost: "0",
      gatewayCost: cost,
    },
  };
}

function step(inputTokens: number, outputTokens: number, providerMetadata: unknown = undefined): AgentJobStepUsage {
  return { tokens: { inputTokens, outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 }, providerMetadata };
}

describe("charging a Mate agent job", () => {
  it("charges the gateway's measured cost of every round, capped at the reservation", () => {
    const steps = [step(1000, 100, billedMetadata("0.0004")), step(2000, 200, billedMetadata("0.0006"))];

    const settlement = buildMateJobSettlement(steps, BUDGET);

    expect(settlement).toMatchObject({
      model: "anthropic/claude-haiku-5.5",
      inputTokens: 3000,
      outputTokens: 300,
      costSource: "measured",
      costMicrocents: 100_000,
      chargedMicrocents: 100_000,
      reservedMicrocents: BUDGET.reservedMicrocents,
      policyBreach: false,
      state: "settled",
    });
  });

  it("estimates a round whose charge the gateway did not report and says so", () => {
    const steps = [step(1000, 100, billedMetadata("0.0004")), step(2000, 200)];

    const settlement = buildMateJobSettlement(steps, BUDGET);

    expect(settlement.costSource).toBe("estimated");
    expect(settlement.costMicrocents).toBeGreaterThan(40_000);
    expect(mateStepCost(steps[1], BUDGET)).toMatchObject({ measured: false });
    expect(mateStepCost(steps[1], BUDGET).costMicrocents).toBeGreaterThan(0);
    expect(mateStepCost(steps[0], BUDGET)).toMatchObject({ measured: true, costMicrocents: 40_000 });
  });

  it("sums the tokens of the rounds", () => {
    expect(sumStepTokens([step(10, 1), step(20, 2)])).toEqual({
      inputTokens: 30,
      outputTokens: 3,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
  });

  it("stops a run when another round could overspend what was reserved", () => {
    expect(mateJobOutOfBudget([step(1000, 100, billedMetadata("0.0004"))], BUDGET)).toBe(false);
    expect(mateJobOutOfBudget([step(1000, 100, billedMetadata("0.0080"))], BUDGET)).toBe(true);
  });
});

describe("reserving credits for a Mate agent job", () => {
  const reservation = {
    reservedMicrocents: BUDGET.reservedMicrocents,
    planSnapshot: "pro" as const,
    subscriptionStatusSnapshot: "active" as const,
    allowanceMicrocentsSnapshot: 1,
    periodStart: new Date(0),
    periodEnd: new Date(1),
    budget: BUDGET,
  };

  function usage(overrides: Record<string, unknown> = {}) {
    return {
      prepareTurn: vi.fn().mockResolvedValue({ summary: { blockedReason: null }, reservation }),
      reserveUsage: vi.fn().mockResolvedValue(true),
      settleReservation: vi.fn().mockResolvedValue(true),
      releaseReservation: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  const args = { jobId: "job-1", attempt: 2, companyId: "company-1", userId: "user-1" };

  it("holds the credits under a name derived from the job and the attempt", async () => {
    const service = usage();
    const credits = new MateAgentJobCredits(service as never);

    const outcome = await credits.reserve(args);

    expect(outcome).toEqual({
      ok: true,
      reservation: {
        reservationId: "agent-job:job-1:2",
        budget: BUDGET,
        reservedMicrocents: BUDGET.reservedMicrocents,
      },
    });
    expect(service.reserveUsage).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: "agent-job:job-1:2", companyId: "company-1", userId: "user-1" }),
    );
    expect(mateJobReservationId("job-1", 2)).toBe("agent-job:job-1:2");
  });

  it("tells exhausted credits from an unavailable service", async () => {
    const exhausted = usage({
      prepareTurn: vi.fn().mockResolvedValue({ summary: { blockedReason: "credits_exhausted" }, reservation: null }),
    });
    const blocked = usage({
      prepareTurn: vi
        .fn()
        .mockResolvedValue({ summary: { blockedReason: "subscription_unavailable" }, reservation: null }),
    });
    const refused = usage({ reserveUsage: vi.fn().mockResolvedValue(false) });
    const overAllowance = usage({
      reserveUsage: vi.fn().mockRejectedValue(new Error("exceeds the current allowance")),
    });

    expect(await new MateAgentJobCredits(exhausted as never).reserve(args)).toEqual({ ok: false, reason: "credits" });
    expect(await new MateAgentJobCredits(blocked as never).reserve(args)).toEqual({ ok: false, reason: "unavailable" });
    expect(await new MateAgentJobCredits(refused as never).reserve(args)).toEqual({ ok: false, reason: "unavailable" });
    expect(await new MateAgentJobCredits(overAllowance as never).reserve(args)).toEqual({
      ok: false,
      reason: "credits",
    });
  });

  it("releases the held credits of the attempt that timed out", async () => {
    const service = usage();

    await new MateAgentJobCredits(service as never).release({ ...args });

    expect(service.releaseReservation).toHaveBeenCalledWith({
      reservationId: "agent-job:job-1:2",
      companyId: "company-1",
      userId: "user-1",
    });
  });
});
