import { describe, expect, it } from "vitest";

import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";
import { EntitlementService, EntitlementSubscriptionRepo } from "@/ee/subscription/entitlement.service";

class StubEntitlementSubscriptionRepo extends EntitlementSubscriptionRepo {
  getSubscriptionOrThrow() {
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
