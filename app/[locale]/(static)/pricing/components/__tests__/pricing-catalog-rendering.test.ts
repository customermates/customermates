import type * as React from "react";
import type { ComponentProps, ReactElement, ReactNode } from "react";

import { Children, createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useEffect: () => undefined,
  useRef: <T>(initial: T) => ({ current: initial }),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      key === "Subscription.picker.connectedAccountsPerUser"
        ? `${String(values?.accounts)} connected accounts`
        : key === "Subscription.picker.hostedAiUsage"
          ? `${String(values?.multiplier)}x Mate usage`
          : key;
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
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ resolvedFormattingLanguageTag: "de-DE" }),
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

vi.mock("@/components/chip/app-chip", () => ({
  AppChip: ({ children }: { children: ReactNode }) => createElement("span", null, children),
}));

const { PricingSection, pricingCardPresentation } = await import("../pricing-section");
const { pricingComparisonPresentation } = await import("../pricing-comparison-table");
const { PlanPicker } = await import(
  "@/app/[locale]/(protected)/w/[workspace]/settings/(workspace)/components/subscription/plan-picker"
);
const { HomepagePricing } = await import("@/app/[locale]/(static)/components/homepage-pricing");

type PlanAction = { onClick: () => void; type?: string; variant?: string; children?: ReactNode };

const pricingCards = ["free", "starter", "pro", "business", "max", "enterprise"].map((plan) => ({
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

    expect(html).toMatch(/<p[^>]*data-pricing-plan="free"/);
    expect(html).not.toMatch(/<article[^>]*data-pricing-plan="free"/);
    expect(html).not.toContain('data-plan="free"');
    expect(html).toContain('data-plan="starter" data-price="€12"');
    expect(html).toContain('data-plan="pro" data-price="€29"');
    expect(html).toContain('data-plan="business" data-price="€69"');
    expect(html).toContain('data-plan="max" data-price="€149"');
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
      ["free", "starter", "pro", "business", "max", "enterprise"].map((plan) => [
        plan,
        { name: plan, button: "Select", buttonHref: "/auth/signup" },
      ]),
    );
    const presentation = pricingComparisonPresentation({
      apiLimitValue: "{perMinute}/min, {perDay}/day",
      customValue: "Custom",
      locale: "en",
      plans: plans as Parameters<typeof pricingComparisonPresentation>[0]["plans"],
      sections: [
        {
          title: "Commercial facts",
          rows: [
            { label: "Price", catalogFact: "monthlyPrice" },
            { label: "Accounts", catalogFact: "includedAccountsPerUser" },
            { label: "Mate usage", catalogFact: "hostedAiUsage" },
            { label: "Storage", catalogFact: "fileStoragePerActiveUser" },
            { label: "People", catalogFact: "maxMembers" },
            { label: "Records", catalogFact: "maxRecords" },
            { label: "API", catalogFact: "apiRequestLimit" },
            { label: "Webhooks", catalogFact: "webhooks" },
          ],
        },
      ],
      unlimitedValue: "Unlimited",
      workspaceStorageValue: "{size} per workspace",
    });

    expect(presentation.sections[0].rows).toEqual([
      { label: "Price", values: ["€0", "€12", "€29", "€69", "€149", "Custom"] },
      { label: "Accounts", values: ["0", "0", "1", "3", "10", "Unlimited"] },
      { label: "Mate usage", values: [false, "1x", "3x", "10x", "20x", "Custom"] },
      { label: "Storage", values: ["100 MB per workspace", "1 GB", "5 GB", "20 GB", "50 GB", "Custom"] },
      { label: "People", values: ["1", "Unlimited", "Unlimited", "Unlimited", "Unlimited", "Unlimited"] },
      { label: "Records", values: ["250", "Unlimited", "Unlimited", "Unlimited", "Unlimited", "Unlimited"] },
      { label: "API", values: ["10/min, 200/day", true, true, true, true, true] },
      { label: "Webhooks", values: [false, true, true, true, true, true] },
    ]);
  });

  it("renders localized picker prices and submits an explicit monthly offer from each plan's own button", () => {
    const onSelect = vi.fn();
    const element = (PlanPicker as unknown as (props: ComponentProps<typeof PlanPicker>) => ReactElement)({
      onSelect,
    });
    const cards = Children.toArray(element.props.children).filter(isValidElement) as ReactElement<{
      children: ReactNode;
      "data-plan"?: string;
    }>[];
    const actions = cards.flatMap((card) =>
      (Children.toArray(card.props.children).filter(isValidElement) as ReactElement<PlanAction>[])
        .filter((child) => typeof child.props.onClick === "function")
        .map((child) => ({ plan: card.props["data-plan"], ...child.props })),
    );
    const html = renderToStaticMarkup(element);

    expect(html).toMatch(/12(?:&nbsp;|\u00a0| )€/);
    expect(html).toMatch(/29(?:&nbsp;|\u00a0| )€/);
    expect(html).toMatch(/69(?:&nbsp;|\u00a0| )€/);
    expect(html).toMatch(/149(?:&nbsp;|\u00a0| )€/);
    expect(html).toContain("20x Mate usage");
    expect(html).not.toMatch(/\b(?:300|1,000|2,000)\b/);
    expect(html).not.toContain('role="button"');
    expect(actions.map(({ plan, type, variant, children }) => ({ plan, type, variant, children }))).toEqual([
      { plan: "starter", type: "button", variant: "secondary", children: "Subscription.picker.choose" },
      { plan: "pro", type: "button", variant: "ink", children: "Subscription.picker.choose" },
      { plan: "business", type: "button", variant: "secondary", children: "Subscription.picker.choose" },
      { plan: "max", type: "button", variant: "secondary", children: "Subscription.picker.choose" },
    ]);

    actions[2]?.onClick();
    expect(onSelect).toHaveBeenCalledWith({
      plan: "business",
      cadence: "monthly",
    });
  });

  it("features the Pro trial plan with the follow-up outcome from the pricing page", () => {
    const element = (PlanPicker as unknown as (props: ComponentProps<typeof PlanPicker>) => ReactElement)({
      onSelect: vi.fn(),
    });
    const html = renderToStaticMarkup(element);
    const featured = [...html.matchAll(/data-featured="true" data-plan="(\w+)"/g)].map((match) => match[1]);
    const proCard = html.slice(html.indexOf('data-plan="pro"'), html.indexOf('data-plan="business"'));

    expect(featured).toEqual(["pro"]);
    expect(html.match(/Subscription\.picker\.bestForFollowUp/g)).toHaveLength(1);
    expect(proCard).toContain("Subscription.picker.bestForFollowUp");
    expect(proCard).toContain("Subscription.picker.taglines.pro");
    for (const plan of ["starter", "pro", "business", "max"])
      expect(html).toContain(`Subscription.picker.taglines.${plan}`);
  });

  it("labels Business for teams and keeps every plan's checkout enabled", () => {
    const onSelect = vi.fn();
    const element = (PlanPicker as unknown as (props: ComponentProps<typeof PlanPicker>) => ReactElement)({
      onSelect,
    });
    const cards = (
      Children.toArray(element.props.children).filter(isValidElement) as ReactElement<{
        children: ReactNode;
        "data-plan"?: string;
      }>[]
    ).filter((card) => card.props["data-plan"] !== undefined);
    const actions = cards.flatMap((card) =>
      (
        Children.toArray(card.props.children).filter(isValidElement) as ReactElement<
          PlanAction & { disabled?: boolean }
        >[]
      )
        .filter((child) => typeof child.props.onClick === "function")
        .map((child) => [card.props["data-plan"], Boolean(child.props.disabled)]),
    );
    const html = renderToStaticMarkup(element);

    expect(actions).toEqual([
      ["starter", false],
      ["pro", false],
      ["business", false],
      ["max", false],
    ]);
    expect(html.match(/Subscription\.picker\.forTeams/g)).toHaveLength(1);
    expect(html).not.toContain("mostPopular");
    expect(html.indexOf("Subscription.picker.forTeams")).toBeLessThan(html.indexOf('data-plan="max"'));
    expect(html.indexOf('data-plan="business"')).toBeLessThan(html.indexOf("Subscription.picker.forTeams"));
  });
});
