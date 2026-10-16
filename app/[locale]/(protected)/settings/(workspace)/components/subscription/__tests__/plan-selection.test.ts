import type { ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ planPickerRenders: 0 }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/components/shared/alert", () => ({
  Alert: ({ children, id }: { children: ReactNode; id?: string }) => createElement("div", { id }, children),
}));
vi.mock("../plan-picker", () => ({
  PlanPicker: () => {
    harness.planPickerRenders += 1;
    return createElement("div", { id: "settings-billing-plan-picker" });
  },
}));

const { PlanSelection } = await import("../plan-selection");

function render(checkout: "none" | "pending" | "overdue") {
  return renderToStaticMarkup(createElement(PlanSelection, { checkout, onAbandon: vi.fn(), onSelect: vi.fn() }));
}

beforeEach(() => {
  harness.planPickerRenders = 0;
});

describe("PlanSelection", () => {
  it("shows only the plans when no checkout was started", () => {
    const markup = render("none");

    expect(harness.planPickerRenders).toBe(1);
    expect(markup).not.toContain("CheckoutPending.title");
    expect(markup).not.toContain("settings-billing-payment-overdue");
  });

  it("replaces the pay buttons with the processing notice and the way out while a payment is pending", () => {
    const markup = render("pending");

    expect(harness.planPickerRenders).toBe(0);
    expect(markup).toContain('id="settings-billing-payment-pending"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("CheckoutPending.title");
    expect(markup).toContain("CheckoutPending.description");
    expect(markup).toContain('id="settings-billing-payment-abandon"');
    expect(markup).toContain("CheckoutPending.abandon");
  });

  it("brings the plans back with a link to support once the payment is overdue", () => {
    const markup = render("overdue");

    expect(harness.planPickerRenders).toBe(1);
    expect(markup).toContain('id="settings-billing-payment-overdue"');
    expect(markup).toContain("CheckoutPending.overdue");
    expect(markup).toContain('href="mailto:mail@customermates.com?subject=CheckoutPending.supportEmailSubject"');
    expect(markup).toContain("CheckoutPending.contactSupport");
    expect(markup).not.toContain("CheckoutPending.title");
  });
});
