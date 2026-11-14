import { describe, expect, it } from "vitest";

import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { PLAN_CATALOG } from "@/core/commercial/plan-catalog";
import { TRIAL_BUSINESS_EMAIL_ACCOUNTS, trialAccountAllowance } from "../trial-account-allowance";

const NOW = new Date("2026-11-13T12:00:00.000Z");
const LATER = new Date("2026-11-20T12:00:00.000Z");
const EARLIER = new Date("2026-11-10T12:00:00.000Z");
const PRO_ACCOUNTS = PLAN_CATALOG.pro.entitlements.includedAccountsPerUser;

function allowance(
  subscription: { status: SubscriptionStatus; trialEndDate: Date | null; plan: SubscriptionPlan },
  email: string,
) {
  return trialAccountAllowance({ subscription, included: PRO_ACCOUNTS, email, now: NOW });
}

describe("trialAccountAllowance", () => {
  const runningTrial = { status: SubscriptionStatus.trial, trialEndDate: LATER, plan: SubscriptionPlan.pro };

  it("gives a running trial with a business address the Business allowance", () => {
    expect(TRIAL_BUSINESS_EMAIL_ACCOUNTS).toBe(PLAN_CATALOG.business.entitlements.includedAccountsPerUser);
    expect(allowance(runningTrial, "jane@acme.example")).toBe(TRIAL_BUSINESS_EMAIL_ACCOUNTS);
  });

  it("keeps the plan allowance for a free mail address", () => {
    expect(allowance(runningTrial, "jane@gmail.com")).toBe(PRO_ACCOUNTS);
  });

  it("keeps the plan allowance once the trial has ended or the plan is paid", () => {
    expect(allowance({ ...runningTrial, trialEndDate: EARLIER }, "jane@acme.example")).toBe(PRO_ACCOUNTS);
    expect(allowance({ ...runningTrial, trialEndDate: null }, "jane@acme.example")).toBe(PRO_ACCOUNTS);
    expect(
      allowance(
        { status: SubscriptionStatus.active, trialEndDate: null, plan: SubscriptionPlan.pro },
        "jane@acme.example",
      ),
    ).toBe(PRO_ACCOUNTS);
  });

  it("never lowers an allowance that is already higher", () => {
    expect(
      trialAccountAllowance({ subscription: runningTrial, included: 10, email: "jane@acme.example", now: NOW }),
    ).toBe(10);
  });
});
