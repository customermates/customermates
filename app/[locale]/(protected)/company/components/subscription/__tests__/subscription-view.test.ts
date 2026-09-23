import type { ComponentType, ReactNode } from "react";
import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

const harness = vi.hoisted(() => ({
  userCanManage: true,
  topBarActions: null as ReactNode,
}));

vi.mock("mobx-react-lite", () => ({
  observer: <T extends ComponentType<any>>(component: T) => component,
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("lucide-react", () => ({ RefreshCw: () => null }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => createElement("button", null, children),
}));
vi.mock("@/core/errors/report-application-error", () => ({ runUserAction: vi.fn() }));
vi.mock("@/app/components/topbar-actions-context", () => ({
  useSetTopBarActions: (actions: ReactNode) => {
    harness.topBarActions = actions;
  },
}));
vi.mock("../subscription-panel", () => ({ SubscriptionPanel: () => null }));
vi.mock("../subscribe-manage-button", () => ({ SubscribeManageButton: () => null }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    subscriptionStore: { subscription: null, handleRefresh: vi.fn() },
    userStore: { canManage: () => harness.userCanManage },
  }),
}));

const { SubscriptionView } = await import("../subscription-view");

const subscription = (overrides: Partial<SubscriptionDto> = {}): SubscriptionDto => ({
  activeUsers: 3,
  currentPeriodEnd: null,
  hasBillingPortal: true,
  hasActiveSubscription: true,
  plan: SubscriptionPlan.pro,
  quantity: 3,
  status: SubscriptionStatus.active,
  trialEndDate: null,
  ...overrides,
});

function refreshShown(initialSubscription: SubscriptionDto) {
  renderToStaticMarkup(createElement(SubscriptionView, { initialSubscription }));
  return renderToStaticMarkup(createElement("div", null, harness.topBarActions)).includes("Subscription.refresh");
}

beforeEach(() => {
  harness.userCanManage = true;
  harness.topBarActions = null;
});

describe("SubscriptionView refresh action", () => {
  it("is offered to a member who can manage the company", () => {
    expect(refreshShown(subscription())).toBe(true);
  });

  it("is hidden from a member who cannot manage the company", () => {
    harness.userCanManage = false;

    expect(refreshShown(subscription())).toBe(false);
  });

  it("is hidden for an enterprise plan and during a trial", () => {
    expect(refreshShown(subscription({ plan: SubscriptionPlan.enterprise }))).toBe(false);
    expect(refreshShown(subscription({ status: SubscriptionStatus.trial }))).toBe(false);
  });
});
