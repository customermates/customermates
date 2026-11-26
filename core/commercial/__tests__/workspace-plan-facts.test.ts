import { describe, expect, it } from "vitest";

import { EMPTY_PLAN_FIT_USAGE, lostOnFree, planThatKeepsItRunning } from "../plan-fit";
import { choosePlanUrl, workspacePlanFacts } from "../workspace-plan-facts";

const NOW = Date.UTC(2026, 10, 26, 12);
const DAY = 86_400_000;
const BILLING_URL = "https://app.example/w/acme/settings/billing";
const busy = { ...EMPTY_PLAN_FIT_USAGE, members: 3, connectedAccounts: 2, maxAccountsPerUser: 1, openDrafts: 4 };

describe("workspace plan facts", () => {
  it("links the billing settings of the workspace", () => {
    expect(choosePlanUrl("https://app.example/", "acme")).toBe(BILLING_URL);
  });

  it("gives a trialing workspace the days left and what the sidebar says stops on the free plan", () => {
    const facts = workspacePlanFacts({
      plan: "pro",
      status: "trial",
      trialEndDate: new Date(NOW + 3 * DAY + 1000),
      onFreePlan: false,
      fit: busy,
      choosePlanUrl: BILLING_URL,
      now: NOW,
    });

    expect(facts).toEqual({
      plan: "pro",
      onFreePlan: false,
      trialDaysLeft: 4,
      lostOnFree: lostOnFree(busy),
      keepsItRunning: planThatKeepsItRunning(busy),
      choosePlanUrl: BILLING_URL,
    });
    expect(facts.lostOnFree.map((loss) => loss.kind)).toEqual(["accounts", "drafts", "members"]);
    expect(facts.keepsItRunning).not.toBeNull();
  });

  it("names the plan that keeps a free workspace running and gives no trial days", () => {
    const facts = workspacePlanFacts({
      plan: "free",
      status: "expired",
      trialEndDate: new Date(NOW - DAY),
      onFreePlan: true,
      fit: busy,
      choosePlanUrl: BILLING_URL,
      now: NOW,
    });

    expect(facts.trialDaysLeft).toBeNull();
    expect(facts.onFreePlan).toBe(true);
    expect(facts.keepsItRunning).toBe(planThatKeepsItRunning(busy));
  });

  it("keeps a paid workspace free of upgrade facts", () => {
    const facts = workspacePlanFacts({
      plan: "business",
      status: "active",
      trialEndDate: null,
      onFreePlan: false,
      fit: busy,
      choosePlanUrl: BILLING_URL,
    });

    expect(facts).toMatchObject({
      trialDaysLeft: null,
      lostOnFree: [],
      keepsItRunning: null,
      choosePlanUrl: BILLING_URL,
    });
  });

  it("names no plan when nothing would be lost on the free plan", () => {
    const facts = workspacePlanFacts({
      plan: "pro",
      status: "trial",
      trialEndDate: new Date(NOW + 10 * DAY),
      onFreePlan: false,
      fit: EMPTY_PLAN_FIT_USAGE,
      choosePlanUrl: BILLING_URL,
      now: NOW,
    });

    expect(facts).toMatchObject({ trialDaysLeft: 10, lostOnFree: [], keepsItRunning: null });
  });
});
