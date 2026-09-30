import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { APP_LOCALES } from "@/i18n/locale-registry";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { createErrorHandler, serializeInteractorFailure } from "@/core/validation/validation.utils";

import {
  CreateAgentCreditAdjustmentSchema,
  CorrectOperatorSubscriptionSnapshotSchema,
  ResetOperatorUserCreditsSchema,
  UpdateHostedAiEnterpriseAllowanceSchema,
  UpdateOperatorUserPlatformAccessSchema,
  UpdateOperatorUserStatusSchema,
} from "../operator.schema";

const operationId = "04d695c1-aea1-47e6-9871-010644068f9a";

describe("operator input contracts", () => {
  it("keeps Enterprise allowances inside the database safety bound", () => {
    const base = {
      companyId: operationId,
      reason: "Contracted allowance",
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
    expect(CreateAgentCreditAdjustmentSchema.safeParse({ ...base, creditDelta: 2.5 }).success).toBe(true);
    expect(CreateAgentCreditAdjustmentSchema.safeParse({ ...base, creditDelta: -0.1 }).success).toBe(true);
    expect(CreateAgentCreditAdjustmentSchema.safeParse({ ...base, creditDelta: 0.25 }).success).toBe(false);
    expect(CreateAgentCreditAdjustmentSchema.safeParse({ ...base, creditDelta: 0.04 }).success).toBe(false);
    expect(
      CreateAgentCreditAdjustmentSchema.safeParse({
        ...base,
        creditDelta: 1,
        periodEnd: base.periodStart,
      }).success,
    ).toBe(false);
  });

  it("requires a positive or null subscription quantity", () => {
    const base = {
      userId: operationId,
      reason: "Correct the local snapshot",
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
  });

  it.each(APP_LOCALES)("returns localized credit adjustment failures in %s", (locale) => {
    const messages = JSON.parse(readFileSync(join(process.cwd(), "i18n/locales", `${locale}.json`), "utf8"));
    const errors = messages.Common.errors;
    const base = {
      companyId: operationId,
      userId: operationId,
      operationId,
      creditDelta: 1,
      periodStart: "2026-08-01T08:00:00.000Z",
      periodEnd: "2026-09-01T08:00:00.000Z",
    };
    const cases = [
      [{ creditDelta: 1.25 }, "creditDelta", CustomErrorCode.operatorCreditPrecision],
      [{ creditDelta: 0 }, "creditDelta", CustomErrorCode.operatorCreditNonzero],
      [{ periodEnd: base.periodStart }, "periodEnd", CustomErrorCode.operatorCreditPeriodInvalid],
    ] as const;

    for (const [input, field, code] of cases) {
      const result = CreateAgentCreditAdjustmentSchema.safeParse(
        { ...base, ...input },
        { error: createErrorHandler(errors) },
      );
      expect(result.success).toBe(false);
      if (result.success) throw new Error("Expected invalid adjustment.");
      expect(serializeInteractorFailure(result.error)).toEqual({
        kind: "validation",
        issues: [{ code: "custom", path: [field], customCode: code, message: errors[code] }],
      });
    }
  });

  it("accepts only the two append-only credit reset modes", () => {
    const base = {
      userId: operationId,
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
        mode: "deleteLedger",
      }).success,
    ).toBe(false);
  });

  it("accepts only an explicit platform-access boolean and rejects unknown keys", () => {
    const base = {
      userId: operationId,
      reason: "Grant operator access for the on-call rotation",
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
      isPlatformOperator: true,
    };

    expect(UpdateOperatorUserPlatformAccessSchema.safeParse(base).data?.reason).toBeUndefined();
    expect(UpdateOperatorUserPlatformAccessSchema.safeParse({ ...base, reason: "   " }).data?.reason).toBeUndefined();
    expect(UpdateOperatorUserPlatformAccessSchema.safeParse({ ...base, reason: "Ad hoc" }).data?.reason).toBe("Ad hoc");
  });
});
