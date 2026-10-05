import { describe, expect, it } from "vitest";

import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { assistantEntryVisible } from "../assistant-entry-visibility";

const active = { status: SubscriptionStatus.active, plan: SubscriptionPlan.pro, trialEndDate: null };

describe("sidebar assistant entry", () => {
  it("reserves the entry before the assistant configuration loads when the plan includes it", () => {
    expect(
      assistantEntryVisible({ agentChatEnabled: true, restricted: false, configEnabled: null, subscription: active }),
    ).toBe(true);
    expect(
      assistantEntryVisible({ agentChatEnabled: true, restricted: false, configEnabled: null, subscription: null }),
    ).toBe(true);
  });

  it("follows the loaded configuration and never shows the entry where the assistant is unavailable", () => {
    expect(
      assistantEntryVisible({ agentChatEnabled: true, restricted: false, configEnabled: false, subscription: active }),
    ).toBe(false);
    expect(
      assistantEntryVisible({ agentChatEnabled: true, restricted: false, configEnabled: true, subscription: null }),
    ).toBe(true);
    expect(
      assistantEntryVisible({ agentChatEnabled: false, restricted: true, configEnabled: true, subscription: active }),
    ).toBe(false);
    expect(
      assistantEntryVisible({
        agentChatEnabled: true,
        restricted: false,
        configEnabled: null,
        subscription: { status: SubscriptionStatus.expired, plan: SubscriptionPlan.pro, trialEndDate: null },
      }),
    ).toBe(false);
  });
});
