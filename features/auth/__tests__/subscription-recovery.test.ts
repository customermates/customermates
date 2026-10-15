import type { TenantUser } from "@/features/user/user.schema";

import { describe, expect, it } from "vitest";

import { Action, Resource, SubscriptionPlan } from "@/generated/prisma";

import { isFirstPlanChoice, resolveSubscriptionRecoveryPath } from "../subscription-recovery";

function user(role: TenantUser["role"]): TenantUser {
  return { role } as TenantUser;
}

describe("resolveSubscriptionRecoveryPath", () => {
  it("allows a system administrator to use self-service checkout", () => {
    expect(
      resolveSubscriptionRecoveryPath(
        user({
          isSystemRole: true,
          permissions: [],
        } as unknown as TenantUser["role"]),
        SubscriptionPlan.pro,
      ),
    ).toBe("selfServiceCheckout");
  });

  it("allows a custom role with the exact company update permission to use checkout", () => {
    expect(
      resolveSubscriptionRecoveryPath(
        user({
          isSystemRole: false,
          permissions: [{ resource: Resource.company, action: Action.update }],
        } as unknown as TenantUser["role"]),
        SubscriptionPlan.business,
      ),
    ).toBe("selfServiceCheckout");
  });

  it("does not infer recovery authority from company read or unrelated update permissions", () => {
    expect(
      resolveSubscriptionRecoveryPath(
        user({
          isSystemRole: false,
          permissions: [
            { resource: Resource.company, action: Action.readAll },
            { resource: Resource.routines, action: Action.update },
          ],
        } as unknown as TenantUser["role"]),
        SubscriptionPlan.pro,
      ),
    ).toBe("administratorRequired");
  });

  it("routes an enterprise administrator to manual billing instead of checkout", () => {
    expect(
      resolveSubscriptionRecoveryPath(
        user({
          isSystemRole: true,
          permissions: [],
        } as unknown as TenantUser["role"]),
        SubscriptionPlan.enterprise,
      ),
    ).toBe("manualEnterpriseBilling");
  });
});

describe("isFirstPlanChoice", () => {
  it("recognizes a workspace that never had a trial or a paid subscription", () => {
    expect(isFirstPlanChoice({ trialEndDate: null, lemonSqueezyId: null })).toBe(true);
    expect(isFirstPlanChoice({ trialEndDate: new Date("2026-10-01T00:00:00.000Z"), lemonSqueezyId: null })).toBe(false);
    expect(isFirstPlanChoice({ trialEndDate: null, lemonSqueezyId: "ls-1" })).toBe(false);
  });
});
