import { describe, expect, it } from "vitest";

import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";
import { EntitlementService } from "@/ee/subscription/entitlement.service";
import { EntitlementSubscriptionRepo } from "@/ee/subscription/entitlement-subscription.repo";

class StubEntitlementSubscriptionRepo extends EntitlementSubscriptionRepo {
  findSubscription() {
    return Promise.resolve({ status: SubscriptionStatus.active, trialEndDate: null, plan: SubscriptionPlan.pro });
  }
}

describe("entitlement resolution without a request scope", () => {
  it("resolves a denial message when no next-intl request state exists", async () => {
    const service = new EntitlementService(new StubEntitlementSubscriptionRepo());

    const denied = await service.require("agentChat");

    expect(denied?.code).toBe("agentChatRequiresCloud");
    expect(denied?.error.issues[0]?.message).toBeTruthy();
  });
});
