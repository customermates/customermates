import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const planFit = vi.hoisted(() => ({ current: null as { maxAccountsPerUser: number } | null }));

vi.mock("next-intl", () => {
  const t = (key: string) => key;
  t.raw = () => [];
  return { useTranslations: () => t };
});
vi.mock("mobx-react-lite", () => ({ observer: <T,>(component: T) => component }));
vi.mock("@/app/components/upsell/use-plan-fit", () => ({ usePlanFit: () => planFit.current }));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ resolvedFormattingLanguageTag: "en", formatNumber: (value: number) => String(value) }),
}));

import type { PurchasablePlanId } from "@/core/commercial/plan-catalog";

import { PlanPicker } from "../plan-picker";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const scrollIntoView = vi.fn();

function render(focusPlan?: PurchasablePlanId, recommendedPlan?: PurchasablePlanId | null) {
  act(() => root.render(createElement(PlanPicker, { onSelect: vi.fn(), focusPlan, recommendedPlan })));
}

function badge(plan: PurchasablePlanId) {
  return card(plan)?.querySelector("[data-recommended-badge]") ?? null;
}

function card(plan: PurchasablePlanId) {
  return container.querySelector<HTMLElement>(`[data-plan='${plan}']`);
}

beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  planFit.current = null;
});

describe("plan picker connected accounts", () => {
  it("says nothing while every plan with an inbox keeps the connected accounts", () => {
    planFit.current = { maxAccountsPerUser: 1 };
    render();

    expect(container.querySelector("[data-account-overage]")).toBeNull();
  });

  it("names the plans that keep fewer accounts than a trial user connected", () => {
    planFit.current = { maxAccountsPerUser: 2 };
    render();

    expect(card("pro")?.querySelector("[data-account-overage]")?.textContent).toBe("Subscription.picker.keepsAccounts");
    expect(card("business")?.querySelector("[data-account-overage]")).toBeNull();
    expect(card("starter")?.querySelector("[data-account-overage]")).toBeNull();
  });
});

describe("plan picker focus", () => {
  it("features Pro and scrolls nowhere when no plan is focused", () => {
    render();

    expect(card("pro")?.getAttribute("data-featured")).toBe("true");
    expect(container.querySelector("[data-focused]")).toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("moves the highlight to the plan an upgrade prompt named and scrolls it into view", () => {
    render("starter");

    expect(card("starter")?.getAttribute("data-focused")).toBe("true");
    expect(card("starter")?.getAttribute("data-featured")).toBe("true");
    expect(card("starter")?.querySelector("[data-variant='ink']")).not.toBeNull();
    expect(card("pro")?.getAttribute("data-featured")).toBeNull();
    expect(card("pro")?.textContent).toContain("Subscription.picker.bestForFollowUp");
    expect(container.querySelectorAll("[data-focused]")).toHaveLength(1);
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView.mock.contexts[0]).toBe(card("starter"));
  });
});

describe("plan picker recommendation", () => {
  it("keeps the existing behaviour when nothing recommends a plan", () => {
    render(undefined, null);

    expect(container.querySelector("[data-recommended]")).toBeNull();
    expect(card("pro")?.getAttribute("data-featured")).toBe("true");
    expect(card("pro")?.textContent).toContain("Subscription.picker.bestForFollowUp");
    expect(container.querySelector("[data-focused]")).toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("badges the recommended plan, keeps Best for follow-up on Pro and focuses the recommended card without moving the page", () => {
    render(undefined, "business");

    expect(badge("business")?.textContent).toBe("Subscription.picker.recommendedForYou");
    expect(container.querySelectorAll("[data-recommended-badge]")).toHaveLength(1);
    expect(card("pro")?.textContent).toContain("Subscription.picker.bestForFollowUp");
    expect(card("business")?.getAttribute("data-focused")).toBe("true");
    expect(card("business")?.getAttribute("data-featured")).toBe("true");
    expect(card("pro")?.getAttribute("data-featured")).toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("recommends Starter for API use and badges only that card", () => {
    render(undefined, "starter");

    expect(badge("starter")).not.toBeNull();
    expect(badge("pro")).toBeNull();
    expect(card("starter")?.getAttribute("data-featured")).toBe("true");
  });

  it("shows one message on Pro instead of two when Pro is the recommendation", () => {
    render(undefined, "pro");

    expect(badge("pro")).not.toBeNull();
    expect(card("pro")?.textContent).not.toContain("Subscription.picker.bestForFollowUp");
    expect(card("pro")?.getAttribute("data-focused")).toBe("true");
  });

  it("lets the plan an upgrade prompt named win over the recommendation but still badges the recommendation", () => {
    render("starter", "pro");

    expect(card("starter")?.getAttribute("data-focused")).toBe("true");
    expect(card("starter")?.getAttribute("data-featured")).toBe("true");
    expect(card("pro")?.getAttribute("data-focused")).toBeNull();
    expect(badge("pro")).not.toBeNull();
    expect(container.querySelectorAll("[data-focused]")).toHaveLength(1);
  });
});
