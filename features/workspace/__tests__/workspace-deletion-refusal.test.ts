import type { WorkspaceDeletionBilling, WorkspaceDeletionSubject } from "../workspace-deletion-refusal";

import { describe, expect, it } from "vitest";
import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { CHECKOUT_PENDING_MS } from "@/ee/subscription/checkout-state";

import { isWorkspaceCreator, workspaceBillingRefusal, workspaceDeleteRefusal } from "../workspace-deletion-refusal";

const NOW = new Date("2026-10-18T12:00:00.000Z");
const LATER = new Date("2026-11-18T12:00:00.000Z");
const EARLIER = new Date("2026-09-18T12:00:00.000Z");

const creator = { id: "login-creator", email: "creator@example.invalid" };
const otherAdmin = { id: "login-other", email: "other@example.invalid" };

function billing(overrides: Partial<WorkspaceDeletionBilling> = {}): WorkspaceDeletionBilling {
  return {
    status: SubscriptionStatus.expired,
    plan: SubscriptionPlan.pro,
    lemonSqueezyId: null,
    currentPeriodEnd: null,
    checkoutStartedAt: null,
    ...overrides,
  };
}

function subject(overrides: Partial<WorkspaceDeletionSubject> = {}): WorkspaceDeletionSubject {
  return {
    createdByAuthUserId: creator.id,
    earliestAdminEmail: creator.email,
    hasActivePlatformOperator: false,
    subscription: billing(),
    ...overrides,
  };
}

describe("workspaceBillingRefusal", () => {
  it("allows a workspace without any subscription row", () => {
    expect(workspaceBillingRefusal(null, NOW)).toBeNull();
  });

  it.each([
    ["an application trial without payment", { status: SubscriptionStatus.trial, trialEndDate: LATER }],
    ["an expired trial", { status: SubscriptionStatus.trial }],
    ["a workspace awaiting its first plan", { status: SubscriptionStatus.expired }],
    ["an expired paid subscription", { status: SubscriptionStatus.expired, lemonSqueezyId: "ls-1" }],
    [
      "a cancelled subscription whose paid period ended",
      { status: SubscriptionStatus.cancelled, lemonSqueezyId: "ls-1", currentPeriodEnd: EARLIER },
    ],
    ["a cancelled subscription without a period end", { status: SubscriptionStatus.cancelled, lemonSqueezyId: "ls-1" }],
    ["an unpaid workspace that never bound a subscription", { status: SubscriptionStatus.unPaid }],
    [
      "a checkout that was started but never paid",
      { status: SubscriptionStatus.expired, checkoutStartedAt: new Date(NOW.getTime() - CHECKOUT_PENDING_MS - 1) },
    ],
  ])("allows %s", (_label, overrides) => {
    expect(workspaceBillingRefusal(billing(overrides), NOW)).toBeNull();
  });

  it.each([
    ["an active subscription", { status: SubscriptionStatus.active, lemonSqueezyId: "ls-1" }],
    ["an active subscription granted without a billing binding", { status: SubscriptionStatus.active }],
    [
      "a past-due subscription the provider still retries",
      { status: SubscriptionStatus.pastDue, lemonSqueezyId: "ls-1" },
    ],
    ["a provider trial that bills when it ends", { status: SubscriptionStatus.trial, lemonSqueezyId: "ls-1" }],
    [
      "a paused or unpaid subscription that can be resumed",
      { status: SubscriptionStatus.unPaid, lemonSqueezyId: "ls-1" },
    ],
    [
      "a cancelled subscription still inside its paid period",
      { status: SubscriptionStatus.cancelled, lemonSqueezyId: "ls-1", currentPeriodEnd: LATER },
    ],
  ])("refuses %s as billing that is still active", (_label, overrides) => {
    expect(workspaceBillingRefusal(billing(overrides), NOW)).toBe("billingActive");
  });

  it("refuses while a checkout may still complete", () => {
    expect(workspaceBillingRefusal(billing({ checkoutStartedAt: new Date(NOW.getTime() - 60_000) }), NOW)).toBe(
      "checkoutPending",
    );
  });

  it.each(Object.values(SubscriptionStatus))("refuses an invoiced enterprise plan in status %s", (status) => {
    expect(workspaceBillingRefusal(billing({ plan: SubscriptionPlan.enterprise, status }), NOW)).toBe("invoiced");
  });

  it("covers every subscription status", () => {
    for (const status of Object.values(SubscriptionStatus)) {
      for (const lemonSqueezyId of [null, "ls-1"])
        expect(["billingActive", null]).toContain(workspaceBillingRefusal(billing({ status, lemonSqueezyId }), NOW));
    }
  });
});

describe("isWorkspaceCreator", () => {
  it("trusts the recorded creator", () => {
    expect(isWorkspaceCreator(subject(), creator)).toBe(true);
    expect(isWorkspaceCreator(subject({ earliestAdminEmail: otherAdmin.email }), creator)).toBe(true);
    expect(isWorkspaceCreator(subject(), otherAdmin)).toBe(false);
  });

  it("falls back to the earliest admin when no creator was recorded", () => {
    const unattributed = subject({ createdByAuthUserId: null });

    expect(isWorkspaceCreator(unattributed, creator)).toBe(true);
    expect(isWorkspaceCreator(unattributed, otherAdmin)).toBe(false);
    expect(isWorkspaceCreator(subject({ createdByAuthUserId: null, earliestAdminEmail: null }), creator)).toBe(false);
  });
});

describe("workspaceDeleteRefusal", () => {
  const allowed = { appMode: "cloud" as const, login: creator, isAdmin: true, subject: subject(), now: NOW };

  it("allows the creating admin of an unpaid cloud workspace", () => {
    expect(workspaceDeleteRefusal(allowed)).toBeNull();
  });

  it("refuses a member without the admin role, even the creator", () => {
    expect(workspaceDeleteRefusal({ ...allowed, isAdmin: false })).toBe("notAdmin");
  });

  it("refuses an admin who did not create the cloud workspace", () => {
    expect(workspaceDeleteRefusal({ ...allowed, login: otherAdmin })).toBe("notCreator");
  });

  it("refuses a workspace with an active platform operator", () => {
    expect(workspaceDeleteRefusal({ ...allowed, subject: subject({ hasActivePlatformOperator: true }) })).toBe(
      "platformOperator",
    );
  });

  it("refuses the creator while billing is still active", () => {
    expect(
      workspaceDeleteRefusal({
        ...allowed,
        subject: subject({ subscription: billing({ status: SubscriptionStatus.active, lemonSqueezyId: "ls-1" }) }),
      }),
    ).toBe("billingActive");
  });

  it("lets any self-hosted admin delete, whatever the billing state", () => {
    const selfHosted = {
      ...allowed,
      appMode: "self-hosted" as const,
      login: otherAdmin,
      subject: subject({
        subscription: billing({ status: SubscriptionStatus.active, plan: SubscriptionPlan.enterprise }),
      }),
    };

    expect(workspaceDeleteRefusal(selfHosted)).toBeNull();
    expect(workspaceDeleteRefusal({ ...selfHosted, isAdmin: false })).toBe("notAdmin");
  });
});
