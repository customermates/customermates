import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import type { SubscriptionPlan } from "@/generated/prisma";

import enMessages from "@/i18n/locales/en.json";
import deMessages from "@/i18n/locales/de.json";

import { resolvePlanChip, SUBSCRIPTION_PAGE_HREF } from "../plan-subtitle";

type Translate = (key: string, values?: Record<string, string | number>) => string;

function makeTranslate(locale: "en" | "de"): Translate {
  const t = createTranslator({ locale, messages: locale === "en" ? enMessages : deMessages });
  return (key, values) => (t as unknown as Translate)(key, values);
}

const en = makeTranslate("en");
const de = makeTranslate("de");

describe("resolvePlanChip", () => {
  it("renders each supported plan name for an active subscription without status text", () => {
    const cases: Array<[SubscriptionPlan, string]> = [
      ["starter", "Starter"],
      ["pro", "Pro"],
      ["business", "Business"],
      ["enterprise", "Enterprise"],
    ];

    for (const [plan, planName] of cases) {
      const chip = resolvePlanChip({ status: "active", plan, trialDaysLeft: null }, en);
      expect(chip).toEqual({ label: planName, variant: "success", href: SUBSCRIPTION_PAGE_HREF });
    }
  });

  it("never shows the active status wording for an active subscription", () => {
    const chip = resolvePlanChip({ status: "active", plan: "pro", trialDaysLeft: null }, en);
    expect(chip?.label).toBe("Pro");
    expect(chip?.label).not.toContain(en("Subscription.status.active"));

    const chipDe = resolvePlanChip({ status: "active", plan: "pro", trialDaysLeft: null }, de);
    expect(chipDe?.label).toBe("Pro");
    expect(chipDe?.label).not.toContain(de("Subscription.status.active"));
  });

  it("appends the localized trial wording after the plan name", () => {
    expect(resolvePlanChip({ status: "trial", plan: "pro", trialDaysLeft: null }, en)?.label).toBe("Pro · Trial");
    expect(resolvePlanChip({ status: "trial", plan: "pro", trialDaysLeft: 4 }, en)?.label).toBe(
      "Pro · Trial · 4 days left",
    );
    expect(resolvePlanChip({ status: "trial", plan: "pro", trialDaysLeft: 4 }, de)?.label).toBe(
      "Pro · Testphase · noch 4 Tage",
    );
  });

  it("keeps trial-day pluralization correct in English and German", () => {
    expect(resolvePlanChip({ status: "trial", plan: "pro", trialDaysLeft: 1 }, en)?.label).toBe(
      "Pro · Trial · 1 day left",
    );
    expect(resolvePlanChip({ status: "trial", plan: "pro", trialDaysLeft: 0 }, en)?.label).toBe(
      "Pro · Trial · ends today",
    );
    expect(resolvePlanChip({ status: "trial", plan: "pro", trialDaysLeft: 1 }, de)?.label).toBe(
      "Pro · Testphase · noch 1 Tag",
    );
    expect(resolvePlanChip({ status: "trial", plan: "pro", trialDaysLeft: 0 }, de)?.label).toBe(
      "Pro · Testphase · endet heute",
    );
  });

  it("uses the success color for an ordinary trial and warning when three or fewer days remain", () => {
    expect(resolvePlanChip({ status: "trial", plan: "pro", trialDaysLeft: null }, en)?.variant).toBe("success");
    expect(resolvePlanChip({ status: "trial", plan: "pro", trialDaysLeft: 5 }, en)?.variant).toBe("success");
    expect(resolvePlanChip({ status: "trial", plan: "pro", trialDaysLeft: 3 }, en)?.variant).toBe("warning");
    expect(resolvePlanChip({ status: "trial", plan: "pro", trialDaysLeft: 0 }, en)?.variant).toBe("warning");
  });

  it("appends localized status wording for attention states with the destructive color", () => {
    expect(resolvePlanChip({ status: "cancelled", plan: "enterprise", trialDaysLeft: null }, en)).toEqual({
      label: "Enterprise · Cancelled",
      variant: "destructive",
      href: SUBSCRIPTION_PAGE_HREF,
    });
    expect(resolvePlanChip({ status: "pastDue", plan: "business", trialDaysLeft: null }, en)?.label).toBe(
      "Business · Past Due",
    );
    expect(resolvePlanChip({ status: "expired", plan: "pro", trialDaysLeft: null }, en)?.label).toBe("Pro · Expired");
    expect(resolvePlanChip({ status: "unPaid", plan: "starter", trialDaysLeft: null }, en)?.label).toBe(
      "Starter · Unpaid",
    );
    expect(resolvePlanChip({ status: "cancelled", plan: "enterprise", trialDaysLeft: null }, de)?.label).toBe(
      "Enterprise · Gekündigt",
    );
  });

  it("returns no chip when subscription data is unavailable (also covers self-hosted suppression)", () => {
    expect(resolvePlanChip({ status: null, plan: null, trialDaysLeft: null }, en)).toBeNull();
    expect(resolvePlanChip({ status: null, plan: "pro", trialDaysLeft: null }, en)).toBeNull();
  });

  it("falls back to the status-only chip for an unrecognized plan value", () => {
    const unknownPlan = "legacy" as SubscriptionPlan;

    const active = resolvePlanChip({ status: "active", plan: unknownPlan, trialDaysLeft: null }, en);
    expect(active).toEqual({ label: "Active", variant: "success", href: SUBSCRIPTION_PAGE_HREF });
    expect(active?.label).not.toContain("legacy");

    const cancelled = resolvePlanChip({ status: "cancelled", plan: unknownPlan, trialDaysLeft: null }, en);
    expect(cancelled).toEqual({ label: "Cancelled", variant: "destructive", href: SUBSCRIPTION_PAGE_HREF });
  });

  it("keeps the subscription page as the chip destination for every rendered state", () => {
    const states = [
      resolvePlanChip({ status: "active", plan: "pro", trialDaysLeft: null }, en),
      resolvePlanChip({ status: "trial", plan: "pro", trialDaysLeft: 2 }, en),
      resolvePlanChip({ status: "pastDue", plan: "business", trialDaysLeft: null }, en),
    ];
    for (const chip of states) expect(chip?.href).toBe("/company/subscription");
  });
});
