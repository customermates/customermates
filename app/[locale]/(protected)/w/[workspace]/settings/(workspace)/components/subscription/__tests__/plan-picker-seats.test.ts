import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => {
  const t = (key: string, values?: Record<string, unknown>) =>
    values
      ? `${key}(${Object.entries(values)
          .map(([name, value]) => `${name}=${String(value)}`)
          .join(",")})`
      : key;
  t.raw = () => [];
  return { useTranslations: () => t };
});
vi.mock("mobx-react-lite", () => ({ observer: <T>(component: T) => component }));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ resolvedFormattingLanguageTag: "en", formatNumber: (value: number) => String(value) }),
}));

const { PlanPicker } = await import("../plan-picker");

function render(props: { checkoutSeats?: number; pausedSeats?: number; currentFree?: boolean }) {
  return renderToStaticMarkup(createElement(PlanPicker, { onSelect: vi.fn(), ...props }));
}

describe("PlanPicker seats", () => {
  it("prices every plan for all seats checkout will charge, paused people included", () => {
    const markup = render({ checkoutSeats: 3, pausedSeats: 2, currentFree: true });

    expect(markup).toContain('data-checkout-seats="3"');
    expect(markup).toContain("Subscription.picker.seatTotal(count=3,total=€36)");
    expect(markup).toContain("Subscription.picker.seatTotal(count=3,total=€87)");
    expect(markup).toContain("Subscription.picker.seatsIncludePaused(count=3,paused=2)");
  });

  it("says nothing about paused people when there are none", () => {
    const markup = render({ checkoutSeats: 1, pausedSeats: 0, currentFree: true });

    expect(markup).toContain("Subscription.picker.seatTotal(count=1,total=€12)");
    expect(markup).not.toContain("seatsIncludePaused");
  });
});
