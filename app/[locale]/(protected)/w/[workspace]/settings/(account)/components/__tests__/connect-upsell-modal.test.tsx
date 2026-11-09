import type { ReactNode } from "react";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  canUpdateCompany: true,
  store: {
    form: { message: "", plan: "business" as "pro" | "business" },
    isOpen: true,
    isLoading: false,
    close: vi.fn(),
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${Object.values(values).map(String).join("|")})` : key,
}));
vi.mock("mobx-react-lite", () => ({
  observer: <T,>(component: T) => component,
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    connectUpsellModalStore: state.store,
    userStore: { user: {}, can: () => state.canUpdateCompany },
  }),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ resolvedFormattingLanguageTag: "en" }),
}));
vi.mock("@/components/modal", () => ({
  AppModal: ({ open, title, children }: { open: boolean; title: string; children: ReactNode }) =>
    open ? (
      <div data-modal-title={title} role="dialog">
        {children}
      </div>
    ) : null,
}));
vi.mock("@/components/shared/app-link", () => ({
  AppLink: ({ children, ...props }: { href: string; children: ReactNode }) => <a {...props}>{children}</a>,
}));
vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => <span data-alt={alt} data-src={src} />,
}));

import { formatCommercialAmount, PLAN_CATALOG } from "@/core/commercial/plan-catalog";

import { ConnectUpsellModal } from "../connect-upsell-modal";

function render() {
  return renderToStaticMarkup(<ConnectUpsellModal />);
}

describe("connect upsell modal", () => {
  beforeEach(() => {
    state.store.form = { message: "ConnectedAccountsCard.upgradeToBusinessForMoreAccounts", plan: "business" };
    state.store.isOpen = true;
    state.canUpdateCompany = true;
  });

  it("previews the inbox, names the plan with its catalog price and lists what unlocks", () => {
    const offer = PLAN_CATALOG.business.offers.monthly;
    const html = render();

    expect(html).toContain("data-upsell-preview");
    expect(html).toContain(
      `Upsell.planPrice(Subscription.planNames.business|${formatCommercialAmount(offer.unitPriceMinor, "en", offer.currency)})`,
    );
    expect(html).toContain("ConnectedAccountsCard.upsellDialogTitle");
    expect(html).toContain("ConnectedAccountsCard.upgradeToBusinessForMoreAccounts");
    expect(html).toContain(
      `Subscription.picker.connectedAccountsPerUser(${PLAN_CATALOG.business.entitlements.includedAccountsPerUser})`,
    );
    expect(html).toContain("Upsell.business.sharedAccounts");
  });

  it("offers one ink action to billing and a quiet cancel", () => {
    const html = render();

    const billingLink = html.match(/<a [^>]*href="\/settings\/billing\?plan=business"[^>]*>/)?.[0];
    expect(billingLink).toContain('data-variant="ink"');
    expect(html).toContain("Upsell.upgradeTo(Subscription.planNames.business)");
    expect(html).toMatch(/<button [^>]*data-variant="ghost"[^>]*>Common\.actions\.cancel<\/button>/);
  });

  it("tells a member who cannot change the plan to ask an admin and offers no billing link", () => {
    state.canUpdateCompany = false;
    const html = render();

    expect(html).toContain(
      "ConnectedAccountsCard.upgradeToBusinessForMoreAccounts Upsell.askAdmin(Subscription.planNames.business)",
    );
    expect(html).not.toContain("/settings/billing");
    expect(html).toContain("Common.actions.cancel");
  });

  it("renders nothing while closed", () => {
    state.store.isOpen = false;

    expect(render()).toBe("");
  });
});
