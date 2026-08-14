import type { ComponentProps, ReactElement, ReactNode } from "react";

import { Children, createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      key === "Subscription.picker.connectedAccountsPerUser" ? `${String(values?.accounts)} connected accounts` : key;
    t.raw = () => ["catalog feature"];
    return t;
  },
}));

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () =>
    Promise.resolve((key: string, values?: Record<string, unknown>) =>
      key === "HomepagePricing.cloud.price" ? `from ${String(values?.price)}` : key,
    ),
}));

vi.mock("mobx-react-lite", () => ({
  observer: <T>(component: T) => component,
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    intlStore: { resolvedFormattingLanguageTag: "de-DE" },
  }),
}));

vi.mock("@/components/ui/slider", () => ({
  Slider: (props: { value: number[] }) => createElement("div", { "data-slider-value": props.value.join(",") }),
}));

vi.mock("../pricing-card", () => ({
  PricingCardComponent: (props: { card: { plan: string }; displayPrice: string; priceSubtext?: string }) =>
    createElement("article", {
      "data-plan": props.card.plan,
      "data-price": props.displayPrice,
      "data-subtext": props.priceSubtext,
    }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));

vi.mock("@/components/shared/app-link", () => ({
  AppLink: ({ children, href }: { children: ReactNode; href: string }) => createElement("a", { href }, children),
}));

vi.mock("@/components/marketing/wave-decoration", () => ({
  WaveDecoration: () => null,
}));

vi.mock("@/components/chip/app-chip", () => ({
  AppChip: ({ children }: { children: ReactNode }) => createElement("span", null, children),
}));

const { PricingSection, pricingCardPresentation } = await import("../pricing-section");
const { pricingComparisonPresentation } = await import("../pricing-comparison-table");
const { PlanPicker } = await import("@/app/[locale]/(protected)/company/components/subscription/plan-picker");
const { HomepagePricing } = await import("@/app/[locale]/(static)/components/homepage-pricing");

const pricingCards = ["starter", "pro", "business", "enterprise"].map((plan) => ({
  plan,
  title: plan,
  description: plan,
  buttonText: "Select",
  buttonHref: "/auth/signup",
  buttonColor: "default" as const,
  buttonVariant: "solid" as const,
  features: [],
}));

describe("catalog-backed pricing rendering", () => {
  it("renders catalog prices and keeps Enterprise sales-led", () => {
    const html = renderToStaticMarkup(
      createElement(PricingSection, {
        ariaLabelSlider: "Users",
        customPrice: "Custom",
        pricingCards: pricingCards as ComponentProps<typeof PricingSection>["pricingCards"],
        totalSuffixPlural: "/month total for {count} users",
        totalSuffixSingular: "/month total for {count} user",
        users: "Users",
      }),
    );

    expect(html).toContain('data-plan="starter" data-price="€12"');
    expect(html).toContain('data-plan="pro" data-price="€29"');
    expect(html).toContain('data-plan="business" data-price="€69"');
    expect(html).toContain('data-plan="enterprise" data-price="Custom"');
    expect(html).toContain('data-subtext="/month total for 1 user"');

    expect(
      pricingCardPresentation({
        plan: "pro",
        userCount: 5,
        locale: "en",
        customPrice: "Custom",
        totalSuffixPlural: "/month total for {count} users",
      }),
    ).toEqual({
      displayPrice: "€145",
      priceSubtext: "/month total for 5 users",
    });
  });

  it("renders the homepage cloud price from the same catalog", async () => {
    const html = renderToStaticMarkup(await HomepagePricing());
    expect(html).toContain("from €12");
  });

  it("renders comparison prices and account allowances from the catalog", () => {
    const plans = Object.fromEntries(
      ["starter", "pro", "business", "enterprise"].map((plan) => [
        plan,
        { name: plan, button: "Select", buttonHref: "/auth/signup" },
      ]),
    );
    const presentation = pricingComparisonPresentation({
      customValue: "Custom",
      locale: "en",
      plans: plans as Parameters<typeof pricingComparisonPresentation>[0]["plans"],
      sections: [
        {
          title: "Commercial facts",
          rows: [
            { label: "Price", catalogFact: "monthlyPrice" },
            { label: "Accounts", catalogFact: "includedAccountsPerUser" },
          ],
        },
      ],
      unlimitedValue: "Unlimited",
    });

    expect(presentation.sections[0].rows).toEqual([
      { label: "Price", values: ["€12", "€29", "€69", "Custom"] },
      { label: "Accounts", values: ["0", "1", "3", "Unlimited"] },
    ]);
  });

  it("renders localized picker prices and submits an explicit monthly offer", () => {
    const onSelect = vi.fn();
    const element = (PlanPicker as unknown as (props: ComponentProps<typeof PlanPicker>) => ReactElement)({
      onSelect,
    });
    const cards = Children.toArray(element.props.children).filter(isValidElement) as ReactElement<{
      onClick: () => void;
    }>[];
    const html = renderToStaticMarkup(element);

    expect(html).toMatch(/12(?:&nbsp;|\u00a0| )€/);
    expect(html).toMatch(/29(?:&nbsp;|\u00a0| )€/);
    expect(html).toMatch(/69(?:&nbsp;|\u00a0| )€/);
    expect(html.match(/<button/g)).toHaveLength(3);
    expect(html).not.toContain('role="button"');

    cards[2]?.props.onClick();
    expect(onSelect).toHaveBeenCalledWith({
      plan: "business",
      cadence: "monthly",
    });
  });
});
