import { describe, expect, it } from "vitest";

import {
  CreateAgentCreditAdjustmentSchema,
  CorrectOperatorSubscriptionSnapshotSchema,
  FindHostedAiOperatorCandidateSchema,
  ListOperatorUsersSchema,
  ResetOperatorUserCreditsSchema,
  UpdateHostedAiEnterpriseAllowanceSchema,
  UpdateHostedAiGlobalControlSchema,
  UpdateOperatorUserPlatformAccessSchema,
  UpdateOperatorUserStatusSchema,
} from "../operator.schema";

const operationId = "04d695c1-aea1-47e6-9871-010644068f9a";

describe("operator input contracts", () => {
  it("normalizes an exact email identifier", () => {
    expect(
      FindHostedAiOperatorCandidateSchema.parse({
        email: "  Linnea@Example.COM ",
      }),
    ).toEqual({
      email: "linnea@example.com",
    });
  });

  it("keeps Enterprise allowances inside the database safety bound", () => {
    const base = {
      companyId: operationId,
      reason: "Contracted allowance",
      operationId,
    };
    expect(
      UpdateHostedAiEnterpriseAllowanceSchema.safeParse({
        ...base,
        creditsPerUser: 1_000_000,
      }).success,
    ).toBe(true);
    expect(
      UpdateHostedAiEnterpriseAllowanceSchema.safeParse({
        ...base,
        creditsPerUser: 1_000_001,
      }).success,
    ).toBe(false);
  });

  it("requires a non-zero signed adjustment for a forward period", () => {
    const base = {
      companyId: operationId,
      userId: operationId,
      reason: "Manual correction",
      operationId,
      periodStart: "2026-08-01T08:00:00.000Z",
      periodEnd: "2026-09-01T08:00:00.000Z",
    };
    expect(CreateAgentCreditAdjustmentSchema.safeParse({ ...base, creditDelta: -1 }).success).toBe(true);
    expect(CreateAgentCreditAdjustmentSchema.safeParse({ ...base, creditDelta: 0 }).success).toBe(false);
    expect(
      CreateAgentCreditAdjustmentSchema.safeParse({
        ...base,
        creditDelta: 1,
        periodEnd: base.periodStart,
      }).success,
    ).toBe(false);
  });

  it("accepts only unsigned 64-bit decimal cap strings", () => {
    const base = {
      expectedVersion: 1,
      hostedProviderWorkPaused: false,
      reason: "Monthly control change",
      operationId,
    };
    expect(
      UpdateHostedAiGlobalControlSchema.safeParse({
        ...base,
        monthlySpendCapMicrocents: "9223372036854775807",
      }).success,
    ).toBe(true);
    expect(
      UpdateHostedAiGlobalControlSchema.safeParse({
        ...base,
        monthlySpendCapMicrocents: "-1",
      }).success,
    ).toBe(false);
    expect(
      UpdateHostedAiGlobalControlSchema.safeParse({
        ...base,
        monthlySpendCapMicrocents: "9223372036854775808",
      }).success,
    ).toBe(false);
  });

  it("normalizes list pagination and validates every filter", () => {
    expect(
      ListOperatorUsersSchema.parse({
        query: "  Linnea   Example  ",
        status: "pendingAuthorization",
        subscriptionPlan: "enterprise",
        subscriptionStatus: "pastDue",
        isPlatformOperator: false,
      }),
    ).toMatchObject({
      query: "Linnea Example",
      limit: 25,
      sort: "newest",
    });
    expect(ListOperatorUsersSchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(ListOperatorUsersSchema.safeParse({ status: "deleted" }).success).toBe(false);
  });

  it("requires optimistic timestamps and a positive or null subscription quantity", () => {
    const base = {
      userId: operationId,
      expectedUpdatedAt: "2026-08-28T12:00:00.000Z",
      reason: "Correct the local snapshot",
      operationId,
    };
    expect(UpdateOperatorUserStatusSchema.safeParse({ ...base, status: "inactive" }).success).toBe(true);
    expect(
      CorrectOperatorSubscriptionSnapshotSchema.safeParse({
        ...base,
        plan: "business",
        status: "active",
        quantity: null,
      }).success,
    ).toBe(true);
    expect(
      CorrectOperatorSubscriptionSnapshotSchema.safeParse({
        ...base,
        plan: "business",
        status: "active",
        quantity: 0,
      }).success,
    ).toBe(false);
    expect(
      UpdateOperatorUserStatusSchema.safeParse({
        ...base,
        expectedUpdatedAt: "yesterday",
        status: "active",
      }).success,
    ).toBe(false);
  });

  it("accepts only the two append-only credit reset modes", () => {
    const base = {
      userId: operationId,
      expectedPeriodStart: "2026-08-01T08:00:00.000Z",
      expectedPeriodEnd: "2026-09-01T08:00:00.000Z",
      expectedBaseAllowanceCredits: 10,
      expectedAdjustmentCredits: -2,
      expectedCommittedCredits: 8,
      reason: "Reconcile the user balance",
      operationId,
    };
    expect(
      ResetOperatorUserCreditsSchema.safeParse({
        ...base,
        mode: "baseAllowance",
      }).success,
    ).toBe(true);
    expect(ResetOperatorUserCreditsSchema.safeParse({ ...base, mode: "zeroBalance" }).success).toBe(true);
    expect(
      ResetOperatorUserCreditsSchema.safeParse({
        ...base,
        mode: "zeroBalance",
        expectedCommittedCredits: -1,
      }).success,
    ).toBe(false);
    expect(
      ResetOperatorUserCreditsSchema.safeParse({
        ...base,
        mode: "deleteLedger",
      }).success,
    ).toBe(false);
  });

  it("accepts only an explicit platform-access boolean and rejects unknown keys", () => {
    const base = {
      userId: operationId,
      expectedUpdatedAt: "2026-08-28T12:00:00.000Z",
      reason: "Grant operator access for the on-call rotation",
      operationId,
    };
    expect(UpdateOperatorUserPlatformAccessSchema.safeParse({ ...base, isPlatformOperator: true }).success).toBe(true);
    expect(UpdateOperatorUserPlatformAccessSchema.safeParse({ ...base, isPlatformOperator: false }).success).toBe(true);
    expect(UpdateOperatorUserPlatformAccessSchema.safeParse(base).success).toBe(false);
    expect(UpdateOperatorUserPlatformAccessSchema.safeParse({ ...base, isPlatformOperator: "true" }).success).toBe(
      false,
    );
    expect(
      UpdateOperatorUserPlatformAccessSchema.safeParse({ ...base, isPlatformOperator: true, status: "active" }).success,
    ).toBe(false);
    expect(
      UpdateOperatorUserPlatformAccessSchema.safeParse({ ...base, isPlatformOperator: true, reason: "x".repeat(501) })
        .success,
    ).toBe(false);
  });

  it("treats an operator reason as optional and reads a blank one as absent", () => {
    const base = {
      userId: operationId,
      expectedUpdatedAt: "2026-08-28T12:00:00.000Z",
      isPlatformOperator: true,
      operationId,
    };

    expect(UpdateOperatorUserPlatformAccessSchema.safeParse(base).data?.reason).toBeUndefined();
    expect(UpdateOperatorUserPlatformAccessSchema.safeParse({ ...base, reason: "   " }).data?.reason).toBeUndefined();
    expect(UpdateOperatorUserPlatformAccessSchema.safeParse({ ...base, reason: "Ad hoc" }).data?.reason).toBe("Ad hoc");
  });
});
