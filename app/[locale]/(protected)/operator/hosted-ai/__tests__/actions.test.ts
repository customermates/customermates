import type {
  AgentCreditAdjustmentDto,
  HostedAiGlobalControlDto,
  HostedAiOperatorCandidateDto,
  HostedAiOperatorCompanyDto,
} from "@/ee/operator/operator.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adjust: vi.fn(),
  allowance: vi.fn(),
  audit: vi.fn(),
  candidate: vi.fn(),
  control: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/core/di", () => ({
  createAgentCreditAdjustmentInteractor: () => ({ invoke: mocks.adjust }),
  findHostedAiOperatorCandidateInteractor: () => ({ invoke: mocks.candidate }),
  listOperatorAuditEventsInteractor: () => ({ invoke: mocks.audit }),
  updateHostedAiEnterpriseAllowanceInteractor: () => ({
    invoke: mocks.allowance,
  }),
  updateHostedAiGlobalControlInteractor: () => ({ invoke: mocks.control }),
}));

import {
  createCreditAdjustmentAction,
  findHostedAiCandidateAction,
  updateEnterpriseAllowanceAction,
  updateGlobalControlAction,
} from "../actions";
import { dollarsToMicrocents, microcentsAsDollarInput } from "../operator-form-values";
import { OperatorConflictError } from "@/ee/operator/operator.errors";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const OPERATION_ID = "33333333-3333-4333-8333-333333333333";
const PERIOD_START = "2026-08-17T13:42:19.000Z";
const PERIOD_END = "2026-09-17T13:42:19.000Z";

const company = {
  companyId: COMPANY_ID,
  subscription: {
    plan: "enterprise",
    status: "active",
    enterpriseCreditsPerUser: 500,
    agentCreditAnchorAt: PERIOD_START,
    trialEndDate: null,
    currentPeriodEnd: PERIOD_END,
  },
  seats: { active: 1, total: 1 },
  currentUtcMonth: {
    settledCostMicrocents: "0",
    reservedExposureMicrocents: "0",
    totalCommittedMicrocents: "0",
    chargedCredits: 0,
    reservedCredits: 0,
  },
} as HostedAiOperatorCompanyDto;

const candidate = {
  userId: USER_ID,
  companyId: COMPANY_ID,
  email: "linnea@example.com",
  displayName: "Linnea",
  status: "active",
  authEmailVerified: true,
  company,
  creditPeriod: {
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    baseAllowanceCredits: 500,
    adjustmentCredits: 0,
    effectiveAllowanceCredits: 500,
    chargedCredits: 0,
    reservedCredits: 0,
    remainingCredits: 500,
    blockedReason: null,
  },
} as HostedAiOperatorCandidateDto;

const adjustment = {
  id: "44444444-4444-4444-8444-444444444444",
  companyId: COMPANY_ID,
  userId: USER_ID,
  creditDelta: 100,
  periodStart: PERIOD_START,
  periodEnd: PERIOD_END,
  reason: "Approved customer correction",
  operationId: OPERATION_ID,
  createdByOperatorUserId: USER_ID,
  createdAt: "2026-08-28T12:00:00.000Z",
} as AgentCreditAdjustmentDto;

function formData(values: Record<string, string>): FormData {
  const result = new FormData();
  for (const [name, value] of Object.entries(values)) result.set(name, value);
  return result;
}

describe("hosted-AI operator server actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("normalizes an exact submitted email without placing it in navigation state", async () => {
    mocks.candidate.mockResolvedValueOnce(candidate);

    const result = await findHostedAiCandidateAction({ status: "idle" }, formData({ email: "  Linnea@Example.COM " }));

    expect(result).toEqual({ status: "success", data: candidate });
    expect(mocks.candidate).toHaveBeenCalledWith({
      email: "linnea@example.com",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects invalid candidate input before calling the interactor", async () => {
    await expect(
      findHostedAiCandidateAction({ status: "idle" }, formData({ email: "not-an-email" })),
    ).resolves.toMatchObject({ status: "error", errorCode: "invalidInput" });
    expect(mocks.candidate).not.toHaveBeenCalled();
  });

  it("returns an authoritative refreshed candidate after setting the Enterprise allowance", async () => {
    mocks.allowance.mockResolvedValueOnce(company);
    mocks.candidate.mockResolvedValueOnce(candidate);

    const result = await updateEnterpriseAllowanceAction(
      { status: "idle" },
      formData({
        candidateEmail: "linnea@example.com",
        companyId: COMPANY_ID,
        creditsPerUser: "500",
        operationId: OPERATION_ID,
        reason: "Approved customer correction",
      }),
    );

    expect(result).toEqual({
      status: "success",
      data: { candidate, company },
      operationId: OPERATION_ID,
    });
    expect(mocks.candidate).toHaveBeenCalledWith({
      email: "linnea@example.com",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/operator/hosted-ai");
  });

  it("keeps the operation ID on a conflict so the same mutation can be retried", async () => {
    mocks.allowance.mockRejectedValueOnce(new OperatorConflictError("stale operation"));

    const result = await updateEnterpriseAllowanceAction(
      { status: "idle" },
      formData({
        candidateEmail: "linnea@example.com",
        companyId: COMPANY_ID,
        creditsPerUser: "500",
        operationId: OPERATION_ID,
        reason: "Approved customer correction",
      }),
    );

    expect(result).toEqual({
      status: "error",
      errorCode: "conflict",
      operationId: OPERATION_ID,
    });
    expect(mocks.candidate).not.toHaveBeenCalled();
  });

  it("does not return stale candidate data when the authoritative post-mutation refresh fails", async () => {
    mocks.allowance.mockResolvedValueOnce(company);
    mocks.candidate.mockResolvedValueOnce(null);

    const result = await updateEnterpriseAllowanceAction(
      { status: "idle" },
      formData({
        candidateEmail: "linnea@example.com",
        companyId: COMPANY_ID,
        creditsPerUser: "500",
        operationId: OPERATION_ID,
        reason: "Approved customer correction",
      }),
    );

    expect(result).toEqual({ status: "error", errorCode: "unexpected", operationId: OPERATION_ID });
  });

  it("passes the authoritative credit period timestamps through unchanged", async () => {
    mocks.adjust.mockResolvedValueOnce(adjustment);
    mocks.candidate.mockResolvedValueOnce(candidate);

    const result = await createCreditAdjustmentAction(
      { status: "idle" },
      formData({
        companyId: COMPANY_ID,
        userId: USER_ID,
        candidateEmail: "linnea@example.com",
        creditDelta: "100",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        operationId: OPERATION_ID,
        reason: "Approved customer correction",
      }),
    );

    expect(result.status).toBe("success");
    expect(result).toMatchObject({ data: { adjustment, candidate }, operationId: OPERATION_ID });
    expect(mocks.adjust).toHaveBeenCalledWith(
      expect.objectContaining({
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      }),
    );
  });

  it("does not return stale credit data when the authoritative adjustment refresh fails", async () => {
    mocks.adjust.mockResolvedValueOnce(adjustment);
    mocks.candidate.mockResolvedValueOnce(null);

    const result = await createCreditAdjustmentAction(
      { status: "idle" },
      formData({
        candidateEmail: "linnea@example.com",
        companyId: COMPANY_ID,
        userId: USER_ID,
        creditDelta: "100",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        operationId: OPERATION_ID,
        reason: "Approved customer correction",
      }),
    );

    expect(result).toEqual({ status: "error", errorCode: "unexpected", operationId: OPERATION_ID });
  });

  it("rejects an authoritative adjustment refresh for a different user", async () => {
    mocks.adjust.mockResolvedValueOnce(adjustment);
    mocks.candidate.mockResolvedValueOnce({
      ...candidate,
      userId: "55555555-5555-4555-8555-555555555555",
    });

    const result = await createCreditAdjustmentAction(
      { status: "idle" },
      formData({
        candidateEmail: "linnea@example.com",
        companyId: COMPANY_ID,
        userId: USER_ID,
        creditDelta: "100",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        operationId: OPERATION_ID,
        reason: "Approved customer correction",
      }),
    );

    expect(result).toEqual({ status: "error", errorCode: "unexpected", operationId: OPERATION_ID });
  });

  it("converts the dollar cap exactly and preserves a blank fail-closed cap as null", async () => {
    const control = {
      id: "global",
      hostedProviderWorkPaused: false,
      monthlySpendCapMicrocents: "1234000000",
      reason: "Approved monthly safety limit",
      version: 2,
      updatedByOperatorUserId: USER_ID,
      createdAt: "2026-08-28T12:00:00.000Z",
      updatedAt: "2026-08-28T12:00:00.000Z",
    } as HostedAiGlobalControlDto;
    mocks.control.mockResolvedValue(control);

    await updateGlobalControlAction(
      { status: "idle" },
      formData({
        expectedVersion: "1",
        monthlySpendCapDollars: "12.34",
        operationId: OPERATION_ID,
        reason: "Approved monthly safety limit",
      }),
    );
    expect(mocks.control).toHaveBeenLastCalledWith(
      expect.objectContaining({
        monthlySpendCapMicrocents: "1234000000",
      }),
    );

    await updateGlobalControlAction(
      { status: "idle" },
      formData({
        expectedVersion: "1",
        monthlySpendCapDollars: "",
        operationId: OPERATION_ID,
        reason: "Block work until cap is decided",
      }),
    );
    expect(mocks.control).toHaveBeenLastCalledWith(
      expect.objectContaining({
        monthlySpendCapMicrocents: null,
      }),
    );
  });
});

describe("operator monetary form values", () => {
  it.each([
    ["", null],
    ["0", "0"],
    ["12.34", "1234000000"],
    ["0.00000001", "1"],
    [" 25.50 ", "2550000000"],
  ])("converts %s dollars to microcents", (input, expected) => {
    expect(dollarsToMicrocents(input)).toBe(expected);
  });

  it.each(["-1", "1.000000001", "1e3", "1,000"])("rejects the ambiguous dollar input %s", (input) => {
    expect(dollarsToMicrocents(input)).toBeUndefined();
  });

  it("round-trips exact microcent values for the form input", () => {
    expect(microcentsAsDollarInput(null)).toBe("");
    expect(microcentsAsDollarInput("1234000001")).toBe("12.34000001");
    expect(dollarsToMicrocents(microcentsAsDollarInput("1234000001"))).toBe("1234000001");
  });
});
