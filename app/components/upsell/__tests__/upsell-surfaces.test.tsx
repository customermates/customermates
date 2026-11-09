import type { ReactElement, ReactNode } from "react";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

function translate(key: string, values?: Record<string, unknown>) {
  return values ? `${key}(${Object.values(values).map(String).join("|")})` : key;
}

vi.mock("next-intl", () => ({
  useTranslations: () => translate,
}));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(translate),
}));
vi.mock("mobx-react-lite", () => ({
  observer: <T,>(component: T) => component,
}));
const harness = vi.hoisted(() => ({ canUpdateCompany: true }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ userStore: { user: {}, can: () => harness.canUpdateCompany } }),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ resolvedFormattingLanguageTag: "en" }),
}));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, ...props }: { href: string; children: ReactNode }) => <a {...props}>{children}</a>,
}));
vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => <span data-alt={alt} data-src={src} />,
}));

import {
  FREE_PLAN_UPGRADE_PLAN,
  formatCommercialAmount,
  PLAN_CATALOG,
  PURCHASABLE_PLAN_IDS,
  type PlanEntitlements,
} from "@/core/commercial/plan-catalog";

import { FreePlanFeatureOverlay } from "../free-plan-feature-overlay";
import { MessagingUpsellOverlay } from "../messaging-upsell-overlay";
import {
  MESSAGING_UPSELL_PLAN,
  nextMateUsagePlan,
  nextRoutinePlan,
  planUpsellHighlights,
  routineAllowanceLabel,
} from "../plan-upsell-highlights";
import { UpsellCta } from "../upsell-cta";
import { UpsellInboxPreview } from "../upsell-inbox-preview";
import { UpsellMatePreview } from "../upsell-mate-preview";
import { UpsellPlanPrice } from "../upsell-plan-price";
import { UpsellRoutinesPreview } from "../upsell-routines-preview";
import { UpsellWebhooksPreview } from "../upsell-webhooks-preview";

function price(plan: "pro" | "business") {
  const offer = PLAN_CATALOG[plan].offers.monthly;
  return formatCommercialAmount(offer.unitPriceMinor, "en", offer.currency);
}

describe("plan upsell highlights", () => {
  it("offers messaging from the cheapest plan that includes it", () => {
    expect(MESSAGING_UPSELL_PLAN).toBe("pro");
    expect(PLAN_CATALOG[MESSAGING_UPSELL_PLAN].entitlements.messaging).toBe(true);
  });

  it("sells Pro by its follow-up outcomes", () => {
    expect(planUpsellHighlights("pro", translate)).toEqual([
      "Upsell.pro.inbox",
      "Upsell.pro.drafts",
      "Upsell.pro.nextSteps",
    ]);
  });

  it("reads the Business allowances from the plan catalog", () => {
    const { includedAccountsPerUser, hostedAiUsageMultiplier } = PLAN_CATALOG.business.entitlements;

    expect(planUpsellHighlights("business", translate)).toEqual([
      `Subscription.picker.connectedAccountsPerUser(${includedAccountsPerUser})`,
      "Upsell.business.sharedAccounts",
      `Subscription.picker.hostedAiUsage(${hostedAiUsageMultiplier})`,
    ]);
  });
});

describe("plan named by a Free gate", () => {
  const unlocks: Record<string, (entitlements: PlanEntitlements) => boolean> = {
    api: (entitlements) => entitlements.usageLimits === null,
    mate: (entitlements) => entitlements.agentChat,
    routines: (entitlements) => entitlements.includedRoutinesPerUser !== 0,
    webhooks: (entitlements) => entitlements.webhooks,
  };

  it.each(Object.keys(unlocks))("is the cheapest plan that unlocks %s", (feature) => {
    const cheapest = PURCHASABLE_PLAN_IDS.find((plan) => unlocks[feature]?.(PLAN_CATALOG[plan].entitlements));

    expect(cheapest).toBe(FREE_PLAN_UPGRADE_PLAN);
  });

  it.each(["routines", "webhooks"] as const)("sends %s to that plan's picker card", async (feature) => {
    const element = (await FreePlanFeatureOverlay({ feature, children: "page" })) as ReactElement<
      Record<string, unknown>
    >;

    const action = element.props.action as ReactElement<{ plan: string }>;

    expect(element.props).toMatchObject({
      title: `Upsell.locked.${feature}.title(Subscription.planNames.${FREE_PLAN_UPGRADE_PLAN})`,
      children: "page",
    });
    expect(action.type).toBe(UpsellCta);
    expect(action.props.plan).toBe(FREE_PLAN_UPGRADE_PLAN);
    expect(renderToStaticMarkup(action)).toContain(`href="/settings/billing?plan=${FREE_PLAN_UPGRADE_PLAN}"`);
  });

  it.each([
    ["routines", UpsellRoutinesPreview],
    ["webhooks", UpsellWebhooksPreview],
  ] as const)("shows a static preview of the %s screen inside the locked card", async (feature, Preview) => {
    const element = (await FreePlanFeatureOverlay({ feature, children: "page" })) as ReactElement<
      Record<string, unknown>
    >;

    expect((element.props.preview as ReactElement).type).toBe(Preview);
  });
});

describe("next plan for an allowance", () => {
  it("offers Pro for more Mate usage on Starter and Business on Pro, never past a contract", () => {
    expect(nextMateUsagePlan("starter")).toBe("pro");
    expect(nextMateUsagePlan("pro")).toBe("business");
    expect(nextMateUsagePlan("max")).toBeNull();
    expect(nextMateUsagePlan("free")).toBeNull();
    expect(nextMateUsagePlan("enterprise")).toBeNull();
  });

  it("offers the next plan with more routines and labels it from the catalog", () => {
    expect(nextRoutinePlan("starter")).toBe("pro");
    expect(nextRoutinePlan("pro")).toBe("business");
    expect(nextRoutinePlan("business")).toBeNull();
    expect(routineAllowanceLabel("pro", translate)).toBe(
      `Subscription.picker.routinesPerUser(${PLAN_CATALOG.pro.entitlements.includedRoutinesPerUser})`,
    );
    expect(routineAllowanceLabel("business", translate)).toBe("Subscription.picker.unlimitedRoutinesPerUser");
  });
});

describe("upsell plan price", () => {
  it.each(["pro", "business"] as const)("prices %s from the commercial catalog", (plan) => {
    const html = renderToStaticMarkup(<UpsellPlanPrice plan={plan} />);

    expect(html).toContain(`Upsell.planPrice(Subscription.planNames.${plan}|${price(plan)})`);
    expect(html).toContain(`data-upsell-plan="${plan}"`);
  });
});

describe("upsell inbox preview", () => {
  it("shows a LinkedIn thread and a Mate draft waiting for review", () => {
    const html = renderToStaticMarkup(<UpsellInboxPreview />);

    expect(html).toContain('aria-label="Upsell.preview.label"');
    expect(html).toContain("/icons/channels/linkedin.svg");
    expect(html).toContain("Upsell.preview.firstMessage");
    expect(html).toContain("Upsell.preview.draftBadge");
    expect(html).toContain("Inbox.compose.draftSendNow");
    expect(html).toContain("customermates-square.svg");
  });

  it("draws Mate's draft in the same neutral tokens as the rest, with no accent colour", () => {
    const html = renderToStaticMarkup(<UpsellInboxPreview />);

    expect(html).toContain("Upsell.preview.nextStep");
    expect(html).not.toMatch(/\b(?:bg|text|ring|border)-(?:primary|mk-violet|info)\b/);
  });
});

describe("messaging upsell overlay", () => {
  async function overlay(reason: "plan" | "subscription") {
    return (await MessagingUpsellOverlay({ reason, children: "inbox" })) as ReactElement<Record<string, unknown>>;
  }

  it("leads with the Pro outcome, its catalog price and a billing action", async () => {
    const element = await overlay("plan");
    const eyebrow = element.props.eyebrow as ReactElement<{ plan: string }>;

    expect(element.props).toMatchObject({
      description: "MessagingUpsell.description",
      title: "MessagingUpsell.title",
      children: "inbox",
    });
    expect(eyebrow.type).toBe(UpsellPlanPrice);
    expect(eyebrow.props.plan).toBe("pro");
    expect((element.props.action as ReactElement<{ plan: string }>).props.plan).toBe("pro");
    expect((element.props.preview as ReactElement).type).toBe(UpsellInboxPreview);
  });

  it("explains an unusable subscription instead of the plan gap", async () => {
    const element = await overlay("subscription");

    expect(element.props.description).toBe("ConnectedAccountsCard.paidSubscriptionRequired");
  });

  it("renders the preview card with one ink action to billing", async () => {
    const html = renderToStaticMarkup(await overlay("plan"));

    expect(html).toContain("data-upsell-preview");
    expect(html).toContain("data-upsell-highlights");
    expect(html).toContain('data-variant="ink"');
    expect(html).toContain('href="/settings/billing?plan=pro"');
    expect(html.match(/data-slot="button"/g)).toHaveLength(1);
  });
});

describe("the locked-feature previews", () => {
  it.each([
    [
      "routines",
      <UpsellRoutinesPreview key="r" />,
      ["NavigationBar.routines", "Upsell.preview.routines.firstName", "RoutineModal.enabled"],
    ],
    [
      "webhooks",
      <UpsellWebhooksPreview key="w" />,
      ["SettingsNav.webhooks", "Common.events.record.created", "WebhookModal.enabled"],
    ],
    [
      "Mate",
      <UpsellMatePreview key="m" />,
      ["AgentChat.title", "Upsell.preview.mate.question", "AgentChat.placeholder"],
    ],
  ])("draws the %s screen in the same card frame as the inbox, labelled as an example", (_, preview, parts) => {
    const html = renderToStaticMarkup(preview);

    expect(html).toContain("data-upsell-preview");
    expect(html).toMatch(/aria-label="Upsell\.preview\.[a-z]+\.label"/);
    for (const part of parts) expect(html).toContain(part);
    expect(html).not.toMatch(/\b(?:bg|text|ring|border)-(?:primary|mk-violet|info)\b/);
  });

  it("hides the example rows from assistive technology so only the label is read", () => {
    const html = renderToStaticMarkup(<UpsellRoutinesPreview />);

    expect(html).toContain("aria-hidden");
    expect(html).not.toContain('aria-hidden="false"');
  });
});

describe("upsell call to action", () => {
  it("is one ink button to the named plan's picker card", () => {
    harness.canUpdateCompany = true;
    const html = renderToStaticMarkup(<UpsellCta plan="business" />);

    expect(html).toContain('data-variant="ink"');
    expect(html).toContain('href="/settings/billing?plan=business"');
    expect(html).toContain("Upsell.upgradeTo(Subscription.planNames.business)");
  });

  it("tells a member who cannot change the plan to ask an admin and offers no link", () => {
    harness.canUpdateCompany = false;
    const html = renderToStaticMarkup(<UpsellCta plan="pro" />);
    harness.canUpdateCompany = true;

    expect(html).toContain("data-upsell-ask-admin");
    expect(html).toContain("Upsell.askAdmin(Subscription.planNames.pro)");
    expect(html).not.toContain("href=");
  });
});
