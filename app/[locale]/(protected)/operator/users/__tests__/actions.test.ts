import type {
  AgentCreditAdjustmentDto,
  OperatorUserDetailDto,
  OperatorUserPageDto,
  ResetOperatorUserCreditsResultDto,
} from "@/ee/operator/operator.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adjust: vi.fn(),
  detail: vi.fn(),
  list: vi.fn(),
  reset: vi.fn(),
  revalidatePath: vi.fn(),
  status: vi.fn(),
  subscription: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/core/di", () => ({
  correctOperatorSubscriptionSnapshotInteractor: () => ({ invoke: mocks.subscription }),
  createAgentCreditAdjustmentInteractor: () => ({ invoke: mocks.adjust }),
  getOperatorUserDetailInteractor: () => ({ invoke: mocks.detail }),
  listOperatorUsersInteractor: () => ({ invoke: mocks.list }),
  resetOperatorUserCreditsInteractor: () => ({ invoke: mocks.reset }),
  updateOperatorUserStatusInteractor: () => ({ invoke: mocks.status }),
}));

import {
  correctOperatorSubscriptionSnapshotAction,
  createOperatorUserCreditAdjustmentAction,
  getOperatorUserDetailAction,
  listOperatorUsersAction,
  resetOperatorUserCreditsAction,
  updateOperatorUserStatusAction,
} from "../actions";
import { OperatorConflictError } from "@/ee/operator/operator.errors";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const OPERATION_ID = "33333333-3333-4333-8333-333333333333";
const CURSOR = "44444444-4444-4444-8444-444444444444";
const PERIOD_START = "2026-08-17T13:42:19.000Z";
const PERIOD_END = "2026-09-17T13:42:19.000Z";
const UPDATED_AT = "2026-08-28T12:00:00.000Z";
const SUBSCRIPTION_UPDATED_AT = "2026-08-28T11:00:00.000Z";

const user = {
  userId: USER_ID,
  companyId: COMPANY_ID,
  email: "linnea@example.com",
  displayName: "Linnea Example",
  status: "active",
  isPlatformOperator: true,
  authEmailVerified: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastActiveAt: UPDATED_AT,
  role: { name: "Admin", isSystemRole: true },
  updatedAt: UPDATED_AT,
  agentCreditActivatedAt: PERIOD_START,
  isCurrentOperator: false,
  statusMutation: { allowed: true, blockedReason: null },
  subscription: {
    plan: "enterprise",
    status: "active",
    quantity: 4,
    billingProviderManaged: true,
    updatedAt: SUBSCRIPTION_UPDATED_AT,
    enterpriseCreditsPerUser: 500,
    agentCreditAnchorAt: PERIOD_START,
    trialEndDate: null,
    currentPeriodEnd: PERIOD_END,
  },
  creditPeriod: {
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    baseAllowanceCredits: 500,
    adjustmentCredits: 0,
    effectiveAllowanceCredits: 500,
    chargedCredits: 100,
    reservedCredits: 20,
    committedCredits: 120,
    remainingCredits: 380,
    overageCredits: 0,
    blockedReason: null,
  },
} satisfies OperatorUserDetailDto;

const page = {
  users: [user],
  nextCursor: CURSOR,
  total: 26,
} satisfies OperatorUserPageDto;

const adjustment = {
  id: "55555555-5555-4555-8555-555555555555",
  companyId: COMPANY_ID,
  userId: USER_ID,
  creditDelta: 100,
  periodStart: PERIOD_START,
  periodEnd: PERIOD_END,
  reason: "Approved account correction",
  operationId: OPERATION_ID,
  createdByOperatorUserId: USER_ID,
  createdAt: UPDATED_AT,
} satisfies AgentCreditAdjustmentDto;

function formData(values: Record<string, string>): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

function mutationValues(values: Record<string, string> = {}): Record<string, string> {
  return {
    userId: USER_ID,
    operationId: OPERATION_ID,
    reason: "Approved account correction",
    ...values,
  };
}

describe("operator user server actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes submitted filters and the opaque cursor to server pagination", async () => {
    mocks.list.mockResolvedValueOnce(page);

    const result = await listOperatorUsersAction(
      formData({
        cursor: CURSOR,
        query: "  linnea@example.com  ",
        status: "active",
        subscriptionPlan: "enterprise",
        subscriptionStatus: "active",
        isPlatformOperator: "true",
        sort: "emailAsc",
      }),
    );

    expect(mocks.list).toHaveBeenCalledWith({
      cursor: CURSOR,
      limit: 25,
      query: "linnea@example.com",
      status: "active",
      subscriptionPlan: "enterprise",
      subscriptionStatus: "active",
      isPlatformOperator: true,
      sort: "emailAsc",
    });
    expect(result).toMatchObject({ status: "success", data: { page } });
  });

  it("rejects an invalid operator filter before invoking the list interactor", async () => {
    await expect(listOperatorUsersAction(formData({ isPlatformOperator: "sometimes" }))).resolves.toEqual({
      status: "error",
      errorCode: "invalidInput",
      operationId: undefined,
    });
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("loads details using only the submitted opaque user ID", async () => {
    mocks.detail.mockResolvedValueOnce(user);

    await expect(getOperatorUserDetailAction(USER_ID)).resolves.toEqual({ status: "success", data: user });
    expect(mocks.detail).toHaveBeenCalledWith({ userId: USER_ID });
  });

  it("passes the authoritative user timestamp and retains the operation ID on a status conflict", async () => {
    mocks.status.mockRejectedValueOnce(new OperatorConflictError("stale user"));

    const result = await updateOperatorUserStatusAction(
      { status: "idle" },
      formData(
        mutationValues({
          expectedUpdatedAt: UPDATED_AT,
          status: "inactive",
        }),
      ),
    );

    expect(mocks.status).toHaveBeenCalledWith({
      userId: USER_ID,
      expectedUpdatedAt: UPDATED_AT,
      status: "inactive",
      reason: "Approved account correction",
      operationId: OPERATION_ID,
    });
    expect(result).toEqual({ status: "error", errorCode: "conflict", operationId: OPERATION_ID });
  });

  it("corrects the company subscription snapshot with its own stale-write timestamp", async () => {
    const refreshed = { ...user, subscription: { ...user.subscription, quantity: null } };
    mocks.subscription.mockResolvedValueOnce(refreshed);

    const result = await correctOperatorSubscriptionSnapshotAction(
      { status: "idle" },
      formData(
        mutationValues({
          expectedUpdatedAt: SUBSCRIPTION_UPDATED_AT,
          plan: "enterprise",
          status: "active",
          quantity: "",
        }),
      ),
    );

    expect(mocks.subscription).toHaveBeenCalledWith({
      userId: USER_ID,
      expectedUpdatedAt: SUBSCRIPTION_UPDATED_AT,
      plan: "enterprise",
      status: "active",
      quantity: null,
      reason: "Approved account correction",
      operationId: OPERATION_ID,
    });
    expect(result).toEqual({ status: "success", data: refreshed, operationId: OPERATION_ID });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/operator/users");
  });

  it("passes exact credit-period timestamps and returns an authoritative refreshed user", async () => {
    mocks.adjust.mockResolvedValueOnce(adjustment);
    mocks.detail.mockResolvedValueOnce(user);

    const result = await createOperatorUserCreditAdjustmentAction(
      { status: "idle" },
      formData(
        mutationValues({
          companyId: COMPANY_ID,
          creditDelta: "100",
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
        }),
      ),
    );

    expect(mocks.adjust).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: COMPANY_ID,
        userId: USER_ID,
        creditDelta: 100,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      }),
    );
    expect(mocks.detail).toHaveBeenCalledWith({ userId: USER_ID });
    expect(result).toEqual({ status: "success", data: { adjustment, user }, operationId: OPERATION_ID });
  });

  it("never reports adjustment success when the authoritative refresh fails", async () => {
    mocks.adjust.mockResolvedValueOnce(adjustment);
    mocks.detail.mockRejectedValueOnce(new Error("refresh failed"));

    const result = await createOperatorUserCreditAdjustmentAction(
      { status: "idle" },
      formData(
        mutationValues({
          companyId: COMPANY_ID,
          creditDelta: "100",
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
        }),
      ),
    );

    expect(result).toEqual({ status: "error", errorCode: "unexpected", operationId: OPERATION_ID });
  });

  it("submits an explicit reset mode and accepts only the selected user in the result", async () => {
    const resetResult = { adjustment, user } satisfies ResetOperatorUserCreditsResultDto;
    mocks.reset.mockResolvedValueOnce(resetResult);

    const result = await resetOperatorUserCreditsAction(
      { status: "idle" },
      formData(
        mutationValues({
          mode: "zeroBalance",
          expectedPeriodStart: PERIOD_START,
          expectedPeriodEnd: PERIOD_END,
          expectedBaseAllowanceCredits: "500",
          expectedAdjustmentCredits: "0",
          expectedCommittedCredits: "120",
        }),
      ),
    );

    expect(mocks.reset).toHaveBeenCalledWith({
      userId: USER_ID,
      mode: "zeroBalance",
      expectedPeriodStart: PERIOD_START,
      expectedPeriodEnd: PERIOD_END,
      expectedBaseAllowanceCredits: 500,
      expectedAdjustmentCredits: 0,
      expectedCommittedCredits: 120,
      reason: "Approved account correction",
      operationId: OPERATION_ID,
    });
    expect(result).toEqual({ status: "success", data: resetResult, operationId: OPERATION_ID });
  });

  it("retains the reset operation ID when the credit position changed concurrently", async () => {
    mocks.reset.mockRejectedValueOnce(new OperatorConflictError("stale credit position"));

    const result = await resetOperatorUserCreditsAction(
      { status: "idle" },
      formData(
        mutationValues({
          mode: "baseAllowance",
          expectedPeriodStart: PERIOD_START,
          expectedPeriodEnd: PERIOD_END,
          expectedBaseAllowanceCredits: "500",
          expectedAdjustmentCredits: "0",
          expectedCommittedCredits: "120",
        }),
      ),
    );

    expect(result).toEqual({ status: "error", errorCode: "conflict", operationId: OPERATION_ID });
  });
});
