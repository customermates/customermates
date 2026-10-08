import type { ComponentType, ReactNode } from "react";
import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  userCanManage: true,
  subscription: null as Partial<SubscriptionDto> | null,
}));

vi.mock("mobx-react-lite", () => ({
  observer: <T extends ComponentType<any>>(component: T) => component,
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick: _onClick, ...props }: { children: ReactNode; onClick?: () => void }) =>
    createElement("button", props, children),
}));
vi.mock("@/components/shared/app-image", () => ({ AppImage: () => null }));
vi.mock("@/core/errors/report-application-error", () => ({ runUserAction: vi.fn() }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    subscriptionStore: { subscription: harness.subscription, handleManageBilling: vi.fn() },
    userStore: { can: () => harness.userCanManage },
  }),
}));

const { SubscribeManageButton } = await import("../subscribe-manage-button");

const renders = () =>
  renderToStaticMarkup(createElement(SubscribeManageButton)).includes("Subscription.manageWithLemonSqueezy");

beforeEach(() => {
  harness.userCanManage = true;
  harness.subscription = { plan: "pro", hasBillingPortal: true, hasActiveSubscription: true };
});

describe("SubscribeManageButton", () => {
  it("is shown to a member who can manage the company when the workspace has a billing portal", () => {
    expect(renders()).toBe(true);
  });

  it("is hidden from a member who cannot manage the company", () => {
    harness.userCanManage = false;

    expect(renders()).toBe(false);
  });

  it("is hidden when the workspace has no billing portal", () => {
    harness.subscription = { plan: "pro", hasBillingPortal: false, hasActiveSubscription: false };

    expect(renders()).toBe(false);
  });

  it("keeps the action in its accessible name when the label is hidden at narrow widths", () => {
    const markup = renderToStaticMarkup(createElement(SubscribeManageButton));

    expect(markup).toContain('aria-label="Subscription.manageWithLemonSqueezy"');
    expect(markup).toContain('<span class="hidden sm:inline">Subscription.manageWithLemonSqueezy</span>');
  });
});
