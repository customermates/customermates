import type { ComponentType, ReactNode } from "react";
import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  companyActions: new Set<string>(),
  subscription: null as Partial<SubscriptionDto> | null,
}));

vi.mock("mobx-react-lite", () => ({
  observer: <T extends ComponentType<any>>(component: T) => component,
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => createElement("button", null, children),
}));
vi.mock("@/components/shared/app-image", () => ({ AppImage: () => null }));
vi.mock("@/core/errors/report-application-error", () => ({ runUserAction: vi.fn() }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    subscriptionStore: { subscription: harness.subscription, handleManageBilling: vi.fn() },
    userStore: {
      can: (resource: string, action: string) => resource === "company" && harness.companyActions.has(action),
      canManage: (resource: string) =>
        resource === "company" && ["create", "update", "delete"].every((action) => harness.companyActions.has(action)),
    },
  }),
}));

const { SubscribeManageButton } = await import("../subscribe-manage-button");

const renders = () =>
  renderToStaticMarkup(createElement(SubscribeManageButton)).includes("Subscription.manageWithLemonSqueezy");

beforeEach(() => {
  harness.companyActions = new Set(["readOwn", "readAll", "create", "update", "delete"]);
  harness.subscription = { plan: "pro", hasBillingPortal: true, hasActiveSubscription: true };
});

describe("SubscribeManageButton follows the server's billing permission", () => {
  it("is shown to a role with full company management", () => {
    expect(renders()).toBe(true);
  });

  it("is shown to a role that may update the company without creating or deleting it", () => {
    harness.companyActions = new Set(["readOwn", "readAll", "update"]);

    expect(renders()).toBe(true);
  });

  it("is hidden from a role that may only read the company", () => {
    harness.companyActions = new Set(["readOwn", "readAll"]);

    expect(renders()).toBe(false);
  });

  it("is hidden when the workspace has no billing portal", () => {
    harness.subscription = { plan: "pro", hasBillingPortal: false, hasActiveSubscription: false };

    expect(renders()).toBe(false);
  });
});
