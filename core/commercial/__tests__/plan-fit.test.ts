import { describe, expect, it } from "vitest";

import { PLAN_CATALOG, PURCHASABLE_PLAN_IDS } from "../plan-catalog";
import {
  EMPTY_PLAN_FIT_USAGE,
  lostOnFree,
  nextStoragePlan,
  planCovers,
  planThatKeepsItRunning,
  recommendedPlan,
  TRIAL_END_WINDOW_DAYS,
  type PlanFitUsage,
} from "../plan-fit";

function usage(overrides: Partial<PlanFitUsage>): PlanFitUsage {
  return { ...EMPTY_PLAN_FIT_USAGE, members: 1, ...overrides };
}

describe("what stops when a trial moves to Free", () => {
  it("lists only what the workspace actually uses, in the order the card shows it", () => {
    const losses = lostOnFree(
      usage({
        members: 3,
        connectedAccounts: 2,
        maxAccountsPerUser: 1,
        openDrafts: 4,
        activeRoutines: 2,
        maxRoutinesPerOwner: 2,
        webhooks: 1,
        mateRequests: 12,
      }),
    );

    expect(losses).toEqual([
      { kind: "accounts", count: 2 },
      { kind: "drafts", count: 4 },
      { kind: "routines", count: 2 },
      { kind: "members", count: 2 },
      { kind: "webhooks", count: 1 },
      { kind: "mate", count: 12 },
    ]);
  });

  it("counts people beyond the one Free seat and ignores a workspace of one", () => {
    expect(lostOnFree(usage({ members: 1 }))).toEqual([]);
    expect(lostOnFree(usage({ members: 0 }))).toEqual([]);
    expect(lostOnFree(usage({ members: 2 }))).toEqual([{ kind: "members", count: 1 }]);
  });

  it("starts four days before the trial ends", () => {
    expect(TRIAL_END_WINDOW_DAYS).toBe(4);
  });
});

describe("the one plan that keeps a workspace running", () => {
  it("names nothing when nothing would stop", () => {
    expect(planThatKeepsItRunning(usage({}))).toBeNull();
    expect(planThatKeepsItRunning(EMPTY_PLAN_FIT_USAGE)).toBeNull();
    expect(planThatKeepsItRunning(usage({ apiClients: 2 }))).toBeNull();
  });

  it("names Starter for a team, webhooks, routines or Mate on their own", () => {
    expect(planThatKeepsItRunning(usage({ members: 4 }))).toBe("starter");
    expect(planThatKeepsItRunning(usage({ webhooks: 2 }))).toBe("starter");
    expect(planThatKeepsItRunning(usage({ mateRequests: 30 }))).toBe("starter");
    expect(planThatKeepsItRunning(usage({ activeRoutines: 1, maxRoutinesPerOwner: 1 }))).toBe("starter");
  });

  it("names Pro once an inbox account or a draft is in use", () => {
    expect(planThatKeepsItRunning(usage({ connectedAccounts: 1, maxAccountsPerUser: 1 }))).toBe("pro");
    expect(planThatKeepsItRunning(usage({ openDrafts: 1 }))).toBe("pro");
  });

  it("moves to the plan whose allowance holds the busiest person", () => {
    expect(planThatKeepsItRunning(usage({ activeRoutines: 5, maxRoutinesPerOwner: 5 }))).toBe("pro");
    expect(planThatKeepsItRunning(usage({ activeRoutines: 6, maxRoutinesPerOwner: 6 }))).toBe("business");
    expect(planThatKeepsItRunning(usage({ connectedAccounts: 3, maxAccountsPerUser: 2 }))).toBe("business");
    expect(planThatKeepsItRunning(usage({ connectedAccounts: 4, maxAccountsPerUser: 4 }))).toBe("max");
  });

  it("names Business for accounts shared with a team and Pro when only one person has the account", () => {
    expect(
      planThatKeepsItRunning(usage({ members: 3, connectedAccounts: 1, maxAccountsPerUser: 1, sharedAccounts: 1 })),
    ).toBe("business");
    expect(
      planThatKeepsItRunning(usage({ members: 1, connectedAccounts: 1, maxAccountsPerUser: 1, sharedAccounts: 1 })),
    ).toBe("pro");
  });

  it("falls back to the top plan when no plan holds what is in use", () => {
    expect(planThatKeepsItRunning(usage({ connectedAccounts: 40, maxAccountsPerUser: 20 }))).toBe("max");
  });

  it("only ever picks a plan whose entitlements cover every used feature", () => {
    const busy = usage({
      members: 4,
      connectedAccounts: 2,
      maxAccountsPerUser: 2,
      openDrafts: 3,
      activeRoutines: 7,
      maxRoutinesPerOwner: 7,
      webhooks: 1,
      mateRequests: 9,
    });
    const plan = planThatKeepsItRunning(busy);

    expect(plan).toBe("business");
    expect(planCovers("business", busy)).toBe(true);
    for (const cheaper of PURCHASABLE_PLAN_IDS.slice(0, PURCHASABLE_PLAN_IDS.indexOf("business")))
      expect(planCovers(cheaper, busy)).toBe(false);
  });
});

describe("the recommended plan in the picker", () => {
  it("has no opinion without a usage signal, so the picker keeps its default", () => {
    expect(recommendedPlan(null)).toBeNull();
    expect(recommendedPlan(EMPTY_PLAN_FIT_USAGE)).toBeNull();
    expect(recommendedPlan(usage({}))).toBeNull();
  });

  it("recommends Pro for a connected messaging account or drafts", () => {
    expect(recommendedPlan(usage({ connectedAccounts: 1, maxAccountsPerUser: 1 }))).toBe("pro");
    expect(recommendedPlan(usage({ openDrafts: 2 }))).toBe("pro");
  });

  it("recommends Business for a team that shares an account", () => {
    expect(recommendedPlan(usage({ members: 2, connectedAccounts: 1, maxAccountsPerUser: 1, sharedAccounts: 1 }))).toBe(
      "business",
    );
  });

  it("recommends Starter for API and MCP use with records and nothing else", () => {
    expect(recommendedPlan(usage({ apiClients: 1 }))).toBe("starter");
  });

  it("lets a messaging signal outrank API use", () => {
    expect(recommendedPlan(usage({ apiClients: 3, connectedAccounts: 1, maxAccountsPerUser: 1 }))).toBe("pro");
  });

  it("recommends Starter for a team of several people without an inbox", () => {
    expect(recommendedPlan(usage({ members: 5 }))).toBe("starter");
  });
});

describe("the next plan with more file storage", () => {
  it("steps up by the per-user storage in the catalog", () => {
    expect(nextStoragePlan("free")).toBe("starter");
    expect(nextStoragePlan("starter")).toBe("pro");
    expect(nextStoragePlan("pro")).toBe("business");
    expect(nextStoragePlan("business")).toBe("max");
    expect(PLAN_CATALOG.max.entitlements.fileStorageBytesPerActiveUser).toBeGreaterThan(
      PLAN_CATALOG.business.entitlements.fileStorageBytesPerActiveUser,
    );
  });

  it("stops at the top plan, a contract and an unknown plan", () => {
    expect(nextStoragePlan("max")).toBeNull();
    expect(nextStoragePlan("enterprise")).toBeNull();
    expect(nextStoragePlan(null)).toBeNull();
    expect(nextStoragePlan(undefined)).toBeNull();
  });
});
