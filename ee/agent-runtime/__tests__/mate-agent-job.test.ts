import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock("@/core/observability/server", () => sentry);

import type { AgentTurnBudget } from "@/ee/agent-chat/agent-budget-policy";
import type { AgentJobStepUsage } from "../run-agent-job-loop";

import { MateJobBudget } from "../mate-agent-job-budget";
import { MateAgentJobCredits, mateJobReservationId } from "../mate-agent-job-credits";
import {
  buildMateJobSettlement,
  mateJobSpentMicrocents,
  mateStepCost,
  sumStepTokens,
} from "../mate-agent-job-settlement";

const CEILING = 10_000_000;

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

  it("charges a round without usage evidence at what was reserved for it, as an estimate", () => {
    const unread: AgentJobStepUsage = { ...step(0, 0), unmeasuredMicrocents: 265_000 };
    const steps = [step(1000, 100, billedMetadata("0.0004")), unread];

    expect(mateStepCost(unread, BUDGET)).toMatchObject({ costMicrocents: 265_000, measured: false });
    expect(buildMateJobSettlement(steps, BUDGET)).toMatchObject({
      costSource: "estimated",
      costMicrocents: 305_000,
      chargedMicrocents: 305_000,
      policyBreach: false,
    });
  });

  it("adds what the tools' re-rank calls cost to the charge", () => {
    const steps = [step(1000, 100, billedMetadata("0.0004"))];
    const rerank = [
      { use: "docs_rerank" as const, model: "jev" as const, costMicrocents: 1_500, measured: true, answered: true },
      { use: "wiki_rerank" as const, model: "jev" as const, costMicrocents: 500, measured: true, answered: false },
    ];

    expect(mateJobSpentMicrocents(steps, rerank, BUDGET)).toBe(42_000);
    expect(buildMateJobSettlement(steps, BUDGET, rerank)).toMatchObject({
      costSource: "measured",
      costMicrocents: 42_000,
      chargedMicrocents: 42_000,
    });
  });
});

describe("the credit check before each round of a Mate agent job", () => {
  const owner = { companyId: "company-1", userId: "user-1" };
  const reservation = {
    reservationId: "agent-job:job-1:1",
    budget: BUDGET,
    reservedMicrocents: 600_000,
    ceilingMicrocents: CEILING,
  };
  const round = (spent: AgentJobStepUsage[] = [], contextBytes = BUDGET.maxContextBytes) => ({
    steps: spent,
    auxiliary: [],
    contextBytes,
    measured: null,
  });

  function world(overrides: Record<string, unknown> = {}) {
    const credits = {
      admitRound: vi.fn().mockResolvedValue(true),
      extend: vi
        .fn()
        .mockImplementation(({ requiredMicrocents }: { requiredMicrocents: number }) =>
          Promise.resolve({ disposition: "extended", reservedMicrocents: requiredMicrocents }),
        ),
      ...overrides,
    };
    return { credits, budget: new MateJobBudget(credits as never, reservation, owner) };
  }

  it("passes the model's output, context and reasoning limits to the run", () => {
    expect(world().budget.limits).toEqual({ maxOutputTokens: 8192, maxContextBytes: 195_000 });
    const reasoning = new MateJobBudget(
      world().credits as never,
      { ...reservation, budget: { ...BUDGET, reasoningEffort: "medium" } },
      owner,
    );
    expect(reasoning.limits).toEqual({ maxOutputTokens: 8192, maxContextBytes: 195_000, reasoning: "medium" });
  });

  it("admits a round the reservation already covers without extending it", async () => {
    const { credits, budget } = world();

    const admission = await budget.admitRound(round([step(1000, 100, billedMetadata("0.0004"))]));

    expect(admission).toEqual({ admitted: true, roundReserveMicrocents: 300_000 });
    expect(credits.admitRound).toHaveBeenCalledWith({ reservationId: "agent-job:job-1:1", ...owner });
    expect(credits.extend).not.toHaveBeenCalled();
    expect(budget.settlementBudget.reservedMicrocents).toBe(600_000);
  });

  it("extends the reservation round by round, so a run can spend up to its ceiling instead of two rounds", async () => {
    const { credits, budget } = world();
    const spent = [step(1000, 100, billedMetadata("0.0040")), step(1000, 100, billedMetadata("0.0040"))];

    const admission = await budget.admitRound(round(spent));

    expect(admission).toEqual({ admitted: true, roundReserveMicrocents: 300_000 });
    expect(credits.extend).toHaveBeenCalledWith({
      reservationId: "agent-job:job-1:1",
      ...owner,
      requiredMicrocents: 1_100_000,
      ceilingMicrocents: CEILING,
    });
    expect(budget.settlementBudget.reservedMicrocents).toBe(1_100_000);
    expect(buildMateJobSettlement(spent, budget.settlementBudget)).toMatchObject({
      reservedMicrocents: 1_100_000,
      chargedMicrocents: 800_000,
      policyBreach: false,
    });
  });

  it("reserves less for a round with a small context than the model's worst case", async () => {
    const worstCase = 2_650_000;
    const budget = new MateJobBudget(
      world().credits as never,
      { ...reservation, budget: { ...BUDGET, roundReserveMicrocents: worstCase }, reservedMicrocents: 2 * worstCase },
      owner,
    );

    const small = await budget.admitRound(round([], 3_000));
    const full = await budget.admitRound(round());

    expect(full).toEqual({ admitted: true, roundReserveMicrocents: worstCase });
    expect(small.admitted).toBe(true);
    if (!small.admitted) return;
    expect(small.roundReserveMicrocents).toBeLessThan(worstCase / 2);
    expect(small.roundReserveMicrocents).toBeGreaterThan(0);
  });

  it("stops the run at its ceiling without asking for more", async () => {
    const { credits, budget } = world();
    const spent = [step(1000, 100, billedMetadata("0.0980"))];

    expect(await budget.admitRound(round(spent))).toEqual({ admitted: false, reason: "creditLimit" });
    expect(credits.extend).not.toHaveBeenCalled();
    expect(credits.admitRound).not.toHaveBeenCalled();
  });

  it("stops the run when the member's allowance cannot cover another round", async () => {
    for (const disposition of ["credit_limit", "run_credit_limit"]) {
      const { budget } = world({ extend: vi.fn().mockResolvedValue({ disposition, ceilingMicrocents: CEILING }) });
      expect(await budget.admitRound(round([step(1000, 100, billedMetadata("0.0080"))]))).toEqual({
        admitted: false,
        reason: "creditLimit",
      });
    }
  });

  it("refuses the round as hosted AI unavailable when the provider is paused or the reservation is gone", async () => {
    const unavailable = { admitted: false, reason: "hostedAiUnavailable" };
    const paused = world({ admitRound: vi.fn().mockResolvedValue(false) });
    expect(await paused.budget.admitRound(round())).toEqual(unavailable);
    expect(paused.credits.extend).not.toHaveBeenCalled();

    for (const disposition of ["hosted_ai_unavailable", "turn_error"]) {
      const gone = world({ extend: vi.fn().mockResolvedValue({ disposition }) });
      expect(await gone.budget.admitRound(round([step(1000, 100, billedMetadata("0.0080"))]))).toEqual(unavailable);
    }
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
      reserveAgentJobUsage: vi.fn().mockResolvedValue("reserved"),
      settleReservation: vi.fn().mockResolvedValue(true),
      releaseReservation: vi.fn().mockResolvedValue(undefined),
      extendAgentJobReservation: vi.fn().mockResolvedValue({ disposition: "extended", reservedMicrocents: 2 }),
      admitAgentJobProviderRound: vi.fn().mockResolvedValue(true),
      closeInterruptedAgentJobReservation: vi.fn().mockResolvedValue("retained"),
      ...overrides,
    };
  }

  const args = { jobId: "job-1", attempt: 2, companyId: "company-1", userId: "user-1" };
  const exhaustedTurn = { summary: { blockedReason: "credits_exhausted" }, reservation: null };

  beforeEach(() => {
    sentry.captureException.mockClear();
  });

  it("holds the credits under a name derived from the job and the attempt, with the ceiling of one run", async () => {
    const service = usage();
    const credits = new MateAgentJobCredits(service as never);

    const outcome = await credits.reserve(args);

    expect(outcome).toEqual({
      ok: true,
      reservation: {
        reservationId: "agent-job:job-1:2",
        budget: BUDGET,
        reservedMicrocents: BUDGET.reservedMicrocents,
        ceilingMicrocents: CEILING,
      },
    });
    expect(service.prepareTurn).toHaveBeenCalledWith(
      "user-1",
      expect.any(Date),
      expect.objectContaining({ creditCeilingMicrocents: CEILING }),
    );
    expect(service.reserveAgentJobUsage).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: "agent-job:job-1:2", companyId: "company-1", userId: "user-1" }),
    );
    expect(mateJobReservationId("job-1", 2)).toBe("agent-job:job-1:2");
  });

  it("tells exhausted credits from an unavailable service", async () => {
    const exhausted = usage({ prepareTurn: vi.fn().mockResolvedValue(exhaustedTurn) });
    const blocked = usage({
      prepareTurn: vi
        .fn()
        .mockResolvedValue({ summary: { blockedReason: "subscription_unavailable" }, reservation: null }),
    });
    const refused = usage({ reserveAgentJobUsage: vi.fn().mockResolvedValue("unavailable") });

    expect(await new MateAgentJobCredits(exhausted as never).reserve(args)).toEqual({ ok: false, reason: "credits" });
    expect(await new MateAgentJobCredits(blocked as never).reserve(args)).toEqual({ ok: false, reason: "unavailable" });
    expect(await new MateAgentJobCredits(refused as never).reserve(args)).toEqual({ ok: false, reason: "unavailable" });
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("reads the allowance again when another reservation took the credits in between", async () => {
    const takenInBetween = usage({
      prepareTurn: vi
        .fn()
        .mockResolvedValueOnce({ summary: { blockedReason: null }, reservation })
        .mockResolvedValueOnce(exhaustedTurn),
      reserveAgentJobUsage: vi.fn().mockResolvedValue("allowance"),
    });
    expect(await new MateAgentJobCredits(takenInBetween as never).reserve(args)).toEqual({
      ok: false,
      reason: "credits",
    });
    expect(takenInBetween.reserveAgentJobUsage).toHaveBeenCalledTimes(1);
    expect(sentry.captureException).not.toHaveBeenCalled();

    const stillEnough = usage({
      reserveAgentJobUsage: vi.fn().mockResolvedValueOnce("allowance").mockResolvedValue("reserved"),
    });
    expect((await new MateAgentJobCredits(stillEnough as never).reserve(args)).ok).toBe(true);
    expect(stillEnough.reserveAgentJobUsage).toHaveBeenCalledTimes(2);
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("calls it out of credits, without reporting an exception, when the allowance is refused every time", async () => {
    const twoJobsForOne = usage({ reserveAgentJobUsage: vi.fn().mockResolvedValue("allowance") });

    expect(await new MateAgentJobCredits(twoJobsForOne as never).reserve(args)).toEqual({
      ok: false,
      reason: "credits",
    });
    expect(twoJobsForOne.prepareTurn).toHaveBeenCalledTimes(2);
    expect(twoJobsForOne.reserveAgentJobUsage).toHaveBeenCalledTimes(2);
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("reports a fault of the credit store and calls it unavailable, never out of credits", async () => {
    const fault = new Error("Can't reach database server");
    const failingReserve = usage({ reserveAgentJobUsage: vi.fn().mockRejectedValue(fault) });
    expect(await new MateAgentJobCredits(failingReserve as never).reserve(args)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(sentry.captureException).toHaveBeenCalledWith(fault);

    sentry.captureException.mockClear();
    const failingRead = usage({ prepareTurn: vi.fn().mockRejectedValue(fault) });
    expect(await new MateAgentJobCredits(failingRead as never).reserve(args)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(sentry.captureException).toHaveBeenCalledWith(fault);
    expect(failingRead.reserveAgentJobUsage).not.toHaveBeenCalled();
  });

  it("asks the credit ledger before each round, extends by name and closes an interrupted attempt", async () => {
    const service = usage();
    const credits = new MateAgentJobCredits(service as never);
    const owner = { reservationId: "agent-job:job-1:2", companyId: "company-1", userId: "user-1" };

    expect(await credits.admitRound(owner)).toBe(true);
    expect(service.admitAgentJobProviderRound).toHaveBeenCalledWith(owner);

    await credits.extend({ ...owner, requiredMicrocents: 900_000, ceilingMicrocents: CEILING });
    expect(service.extendAgentJobReservation).toHaveBeenCalledWith({
      ...owner,
      requiredMicrocents: 900_000,
      ceilingMicrocents: CEILING,
    });

    expect(await credits.settleInterrupted(args)).toBe("retained");
    expect(service.closeInterruptedAgentJobReservation).toHaveBeenCalledWith({
      ...owner,
      model: credits.model.modelId,
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
