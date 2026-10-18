import type { WorkspacePlan } from "../workspace-plan.repo";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

const mocks = vi.hoisted(() => ({ env: { APP_MODE: "cloud" as "cloud" | "demo" | "self-hosted" } }));

vi.mock("@/env", () => ({ env: mocks.env }));

import { WorkspacePlanService } from "../workspace-plan.service";

const DAY_MS = 24 * 60 * 60 * 1000;

function plan(overrides: Partial<WorkspacePlan>): WorkspacePlan {
  return {
    status: SubscriptionStatus.active,
    plan: SubscriptionPlan.pro,
    lemonSqueezyId: "ls-1",
    trialEndDate: null,
    currentPeriodEnd: new Date(Date.now() + 30 * DAY_MS),
    ...overrides,
  };
}

const AWAITING_FIRST_PLAN = plan({
  status: SubscriptionStatus.expired,
  lemonSqueezyId: null,
  trialEndDate: null,
  currentPeriodEnd: null,
});

function service(found: WorkspacePlan | null) {
  return new WorkspacePlanService({ findWorkspacePlanUnscoped: vi.fn().mockResolvedValue(found) });
}

describe("WorkspacePlanService", () => {
  beforeEach(() => {
    mocks.env.APP_MODE = "cloud";
  });

  it("refuses integrations of a cloud workspace that is still waiting for its first plan", async () => {
    await expect(service(AWAITING_FIRST_PLAN).canUseIntegrations("company-1")).resolves.toBe(false);
    await expect(service(AWAITING_FIRST_PLAN).canCreateIntegrations("company-1")).resolves.toBe(false);
  });

  it.each([
    ["an active subscription", plan({})],
    [
      "a running trial",
      plan({ status: SubscriptionStatus.trial, lemonSqueezyId: null, trialEndDate: new Date(Date.now() + DAY_MS) }),
    ],
    ["a cancelled subscription until it ends", plan({ status: SubscriptionStatus.cancelled })],
    ["a past due subscription", plan({ status: SubscriptionStatus.pastDue })],
  ])("keeps existing and new integrations working with %s", async (_label, found) => {
    await expect(service(found).canUseIntegrations("company-1")).resolves.toBe(true);
    await expect(service(found).canCreateIntegrations("company-1")).resolves.toBe(true);
  });

  it.each([
    ["a lapsed paid subscription", plan({ status: SubscriptionStatus.expired })],
    ["an unpaid subscription", plan({ status: SubscriptionStatus.unPaid })],
    [
      "an ended trial",
      plan({ status: SubscriptionStatus.trial, lemonSqueezyId: null, trialEndDate: new Date(Date.now() - DAY_MS) }),
    ],
    [
      "an expired Enterprise plan",
      plan({
        status: SubscriptionStatus.expired,
        plan: SubscriptionPlan.enterprise,
        lemonSqueezyId: null,
        currentPeriodEnd: null,
      }),
    ],
  ])(
    "keeps existing integrations through the grace before deactivation but refuses new ones with %s",
    async (_label, found) => {
      await expect(service(found).canUseIntegrations("company-1")).resolves.toBe(true);
      await expect(service(found).canCreateIntegrations("company-1")).resolves.toBe(false);
    },
  );

  it.each(["self-hosted", "demo"] as const)("does not consult the plan in %s mode", async (mode) => {
    mocks.env.APP_MODE = mode;
    const repo = { findWorkspacePlanUnscoped: vi.fn() };
    const plans = new WorkspacePlanService(repo);

    await expect(plans.canUseIntegrations("company-1")).resolves.toBe(true);
    await expect(plans.canCreateIntegrations("company-1")).resolves.toBe(true);
    expect(repo.findWorkspacePlanUnscoped).not.toHaveBeenCalled();
  });
});
