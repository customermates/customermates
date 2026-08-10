import type { TenantUser } from "@/features/user/user.schema";

import { describe, expect, it } from "vitest";

import { Action, Resource, SubscriptionPlan } from "@/generated/prisma";

import { resolveSubscriptionRecoveryMode } from "../subscription-recovery";

function user(role: TenantUser["role"]): TenantUser {
  return { role } as TenantUser;
}

describe("resolveSubscriptionRecoveryMode", () => {
  it("allows a system administrator to use self-serve recovery", () => {
    expect(
      resolveSubscriptionRecoveryMode(
        user({
          isSystemRole: true,
          permissions: [],
        } as unknown as TenantUser["role"]),
        SubscriptionPlan.pro,
      ),
    ).toBe("selfServe");
  });

  it("allows a member with the exact company update permission", () => {
    expect(
      resolveSubscriptionRecoveryMode(
        user({
          isSystemRole: false,
          permissions: [{ resource: Resource.company, action: Action.update }],
        } as unknown as TenantUser["role"]),
        SubscriptionPlan.business,
      ),
    ).toBe("selfServe");
  });

  it("does not infer recovery authority from company read or unrelated update permissions", () => {
    expect(
      resolveSubscriptionRecoveryMode(
        user({
          isSystemRole: false,
          permissions: [
            { resource: Resource.company, action: Action.readAll },
            { resource: Resource.contacts, action: Action.update },
          ],
        } as unknown as TenantUser["role"]),
        SubscriptionPlan.pro,
      ),
    ).toBe("member");
  });

  it("routes an enterprise administrator to managed recovery instead of self-serve checkout", () => {
    expect(
      resolveSubscriptionRecoveryMode(
        user({
          isSystemRole: true,
          permissions: [],
        } as unknown as TenantUser["role"]),
        SubscriptionPlan.enterprise,
      ),
    ).toBe("managed");
  });
});
