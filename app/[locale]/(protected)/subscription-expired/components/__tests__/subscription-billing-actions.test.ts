import type { ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  subscription: null as null | {
    canManageSubscription: boolean;
    customerPortalUrl: string | null;
  },
}));

vi.mock("mobx-react-lite", () => ({
  observer: <T>(component: T) => component,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    loadingOverlayStore: { isLoading: false },
    subscriptionStore: { subscription: state.subscription },
    subscriptionExpiredStore: { handleSubscribe: vi.fn() },
  }),
}));

vi.mock("@/components/shared/app-link", () => ({
  AppLink: ({ children, href }: { children: ReactNode; href: string }) => createElement("a", { href }, children),
}));

vi.mock("@/components/shared/app-image", () => ({
  AppImage: ({ alt }: { alt: string }) => createElement("img", { alt }),
}));

vi.mock("@/components/card/app-card", () => ({
  AppCard: ({ children }: { children: ReactNode }) => createElement("section", null, children),
}));

vi.mock("@/components/card/app-card-body", () => ({
  AppCardBody: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));

vi.mock("@/components/card/app-card-footer", () => ({
  AppCardFooter: ({ children }: { children: ReactNode }) => createElement("footer", null, children),
}));

vi.mock("@/components/card/card-hero-header", () => ({
  CardHeroHeader: () => createElement("header"),
}));

vi.mock("@/app/[locale]/(protected)/company/components/subscription/plan-picker", () => ({
  PlanPicker: () => createElement("div", { "data-plan-picker": true }),
}));

const { SubscribeManageButton } = await import(
  "@/app/[locale]/(protected)/company/components/subscription/subscribe-manage-button"
);
const { SubscriptionExpiredView } = await import("../subscription-expired-view");

beforeEach(() => {
  state.subscription = null;
});

describe("subscription billing actions", () => {
  it("renders the authorized provider portal as one valid interactive element", () => {
    state.subscription = {
      canManageSubscription: true,
      customerPortalUrl: "https://billing.example.com/portal",
    };

    const html = renderToStaticMarkup(createElement(SubscribeManageButton));

    expect(html).toContain('<a href="https://billing.example.com/portal"');
    expect(html).not.toContain("<button");
  });

  it("hides the provider portal when billing management is unauthorized", () => {
    state.subscription = {
      canManageSubscription: false,
      customerPortalUrl: "https://billing.example.com/portal",
    };

    expect(renderToStaticMarkup(createElement(SubscribeManageButton))).toBe("");
  });

  it("shows checkout only without a provider subscription and otherwise offers the portal", () => {
    const checkoutHtml = renderToStaticMarkup(
      createElement(SubscriptionExpiredView, {
        canStartCheckout: true,
        customerPortalUrl: null,
      }),
    );
    const portalHtml = renderToStaticMarkup(
      createElement(SubscriptionExpiredView, {
        canStartCheckout: false,
        customerPortalUrl: "https://billing.example.com/portal",
      }),
    );

    expect(checkoutHtml).toContain("data-plan-picker");
    expect(checkoutHtml).not.toContain("billing.example.com");
    expect(portalHtml).not.toContain("data-plan-picker");
    expect(portalHtml).toContain('<a href="https://billing.example.com/portal"');
    expect(portalHtml).not.toContain('<a href="https://billing.example.com/portal"><button');
  });
});
