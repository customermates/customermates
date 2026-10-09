import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { CalculatedValue, RecordFieldView } from "@/features/records/record-model.schema";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formattingLocale: "en-US", formatNumber: (value: number) => String(value) }),
}));

import { RecordValue } from "../record-value";

const money = { id: "value", label: "Value", valueType: "currency", options: [] } as unknown as RecordFieldView;
const number = { id: "quantity", label: "Quantity", valueType: "number", options: [] } as unknown as RecordFieldView;
const decimal = (amount: string, currency: string | null): CalculatedValue =>
  ({ state: "value", value: { kind: "decimal", value: amount, currency } }) as CalculatedValue;
const rendered = (field: RecordFieldView, result: CalculatedValue, compact?: boolean) =>
  renderToStaticMarkup(createElement(RecordValue, { field, result, compact }));
const amount = (text: string) => `<span class="font-mono tabular-nums">${text}</span>`;

describe("compact money on cards", () => {
  it("shortens money only in the compact variant", () => {
    expect(rendered(money, decimal("342000", "EUR"), true)).toBe(amount("€342K"));
    expect(rendered(money, decimal("1200000", "EUR"), true)).toBe(amount("€1.2M"));
    expect(rendered(money, decimal("342000", "EUR"))).toBe(amount("€342,000.00"));
  });

  it("keeps plain numbers in full even when compact", () => {
    expect(rendered(number, decimal("1050", null), true)).toBe(amount("1,050"));
  });
});
