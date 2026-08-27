import type { ComponentType, ReactNode } from "react";
import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

const harness = vi.hoisted(() => ({
  outputs: [] as Array<{ description?: ReactNode; help?: ReactNode; label: string; children: ReactNode }>,
  planPickerRenders: 0,
  translationCalls: [] as Array<{ key: string; values?: Record<string, string | number> }>,
  userCanManage: true,
}));

const subscriptionStore = vi.hoisted(() => ({
  subscription: null as SubscriptionDto | null,
  handleSubscribe: vi.fn(),
  setSubscription: vi.fn(),
}));

vi.mock("mobx-react-lite", () => ({
  observer: <T extends ComponentType<any>>(component: T) => component,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    harness.translationCalls.push({ key, values });
    return key;
  },
}));

vi.mock("@/components/chip/app-chip", () => ({
  AppChip: ({ children }: { children: ReactNode }) => createElement("span", null, children),
}));
vi.mock("@/components/forms/form-output-field", () => ({
  FormOutputField: (props: { description?: ReactNode; help?: ReactNode; label: string; children: ReactNode }) => {
    harness.outputs.push(props);
    return createElement("div", { "data-output": props.label }, props.children);
  },
}));
vi.mock("@/components/shared/alert", () => ({ Alert: () => null }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    loadingOverlayStore: { isLoading: false },
    subscriptionStore,
    userStore: { canManage: () => harness.userCanManage },
  }),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatDescriptiveLongDate: (value: Date) => `date:${value.toISOString()}`,
  }),
}));
vi.mock("../plan-picker", () => ({
  PlanPicker: () => {
    harness.planPickerRenders += 1;
    return null;
  },
}));

import { SubscriptionPanel } from "../subscription-panel";

beforeEach(() => {
  harness.outputs.length = 0;
  harness.planPickerRenders = 0;
  harness.translationCalls.length = 0;
  harness.userCanManage = true;
  subscriptionStore.subscription = null;
});

describe("SubscriptionPanel read-only fields", () => {
  it("uses shared outputs and explains the provider-managed values and their change paths", () => {
    const initialSubscription: SubscriptionDto = {
      activeUsers: 3,
      currentPeriodEnd: new Date("2026-09-30T00:00:00.000Z"),
      customerPortalUrl: "https://billing.example.test",
      hasActiveSubscription: true,
      plan: SubscriptionPlan.pro,
      quantity: 4,
      status: SubscriptionStatus.trial,
      trialEndDate: new Date("2026-09-01T00:00:00.000Z"),
    };

    const markup = renderToStaticMarkup(createElement(SubscriptionPanel, { initialSubscription }));

    expect(markup).toContain("date:2026-09-01T00:00:00.000Z");
    expect(markup).toContain("date:2026-09-30T00:00:00.000Z");
    expect(harness.outputs.map(({ label }) => label)).toEqual([
      "Subscription.plan",
      "Subscription.trialEnds",
      "Subscription.currentPeriodEnd",
      "Subscription.quantity",
    ]);
    expect(harness.translationCalls).toContainEqual({
      key: "Subscription.fieldHelp.planManage",
      values: { billing: "Subscription.manageWithLemonSqueezy" },
    });
    expect(harness.translationCalls).toContainEqual({
      key: "Subscription.fieldHelp.currentPeriodEndManage",
      values: { billing: "Subscription.manageWithLemonSqueezy" },
    });
    expect(harness.translationCalls).toContainEqual({
      key: "Subscription.fieldHelp.trialEndsManage",
      values: { billing: "Subscription.manageWithLemonSqueezy" },
    });
    expect(harness.translationCalls).toContainEqual({
      key: "Subscription.fieldHelp.quantity",
      values: { company: "UserAvatar.company" },
    });
    expect(harness.outputs.at(-1)?.description).toBe("Subscription.seatBillingNote");
  });

  it("only references the plan picker when it is available", () => {
    renderToStaticMarkup(createElement(SubscriptionPanel, { initialSubscription: null }));

    expect(harness.translationCalls).toContainEqual({ key: "Subscription.fieldHelp.planPicker", values: undefined });
    expect(harness.translationCalls.some(({ key }) => key === "Subscription.fieldHelp.planManage")).toBe(false);
    expect(harness.planPickerRenders).toBe(1);
  });

  it("hides checkout and uses administrator guidance for a read-only workspace", () => {
    harness.userCanManage = false;

    renderToStaticMarkup(createElement(SubscriptionPanel, { initialSubscription: null }));

    expect(harness.translationCalls).toContainEqual({
      key: "Subscription.fieldHelp.planReadOnly",
      values: undefined,
    });
    expect(harness.translationCalls.some(({ key }) => key === "Subscription.fieldHelp.planPicker")).toBe(false);
    expect(harness.planPickerRenders).toBe(0);
  });

  it("uses administrator guidance when billing management is unavailable", () => {
    harness.userCanManage = false;

    renderToStaticMarkup(
      createElement(SubscriptionPanel, {
        initialSubscription: {
          activeUsers: 3,
          currentPeriodEnd: new Date("2026-09-30T00:00:00.000Z"),
          customerPortalUrl: "https://billing.example.test",
          hasActiveSubscription: true,
          plan: SubscriptionPlan.pro,
          quantity: 4,
          status: SubscriptionStatus.active,
          trialEndDate: null,
        },
      }),
    );

    expect(harness.translationCalls).toContainEqual({
      key: "Subscription.fieldHelp.planReadOnly",
      values: undefined,
    });
    expect(harness.translationCalls).toContainEqual({
      key: "Subscription.fieldHelp.currentPeriodEndReadOnly",
      values: undefined,
    });
  });

  it("uses support guidance when an administrator has no billing portal", () => {
    renderToStaticMarkup(
      createElement(SubscriptionPanel, {
        initialSubscription: {
          activeUsers: 3,
          currentPeriodEnd: new Date("2026-09-30T00:00:00.000Z"),
          customerPortalUrl: null,
          hasActiveSubscription: true,
          plan: SubscriptionPlan.pro,
          quantity: 4,
          status: SubscriptionStatus.active,
          trialEndDate: null,
        },
      }),
    );

    expect(harness.translationCalls).toContainEqual({
      key: "Subscription.fieldHelp.planUnavailable",
      values: undefined,
    });
    expect(harness.translationCalls).toContainEqual({
      key: "Subscription.fieldHelp.currentPeriodEndUnavailable",
      values: undefined,
    });
  });
});
