import { describe, expect, it } from "vitest";

import { PURCHASABLE_PLAN_IDS } from "@/core/commercial/plan-catalog";

import { billingFocusPlan, billingHref, settingsHref } from "../settings-routes";

describe("billing links", () => {
  it("opens the billing page plain or with the plan an upgrade prompt names", () => {
    expect(billingHref()).toBe(settingsHref("billing"));
    expect(billingHref("starter")).toBe("/settings/billing?plan=starter");
  });

  it.each(PURCHASABLE_PLAN_IDS)("reads back the %s link it builds", (plan) => {
    const param = new URL(billingHref(plan), "http://localhost").searchParams.get("plan") ?? undefined;

    expect(billingFocusPlan(param)).toBe(plan);
  });

  it("ignores a plan that cannot be bought and repeated values", () => {
    expect(billingFocusPlan("free")).toBeUndefined();
    expect(billingFocusPlan("enterprise")).toBeUndefined();
    expect(billingFocusPlan("unknown")).toBeUndefined();
    expect(billingFocusPlan(["starter", "pro"])).toBeUndefined();
    expect(billingFocusPlan(undefined)).toBeUndefined();
  });
});
