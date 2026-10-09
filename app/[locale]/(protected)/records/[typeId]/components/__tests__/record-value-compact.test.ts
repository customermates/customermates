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
const text = (field: RecordFieldView, result: CalculatedValue, compact?: boolean) =>
  renderToStaticMarkup(createElement(RecordValue, { field, result, compact })).replace(/<[^>]+>/g, "");

describe("compact money on cards", () => {
  it("shortens money only in the compact variant", () => {
    expect(text(money, decimal("342000", "EUR"), true)).toBe("€342K");
    expect(text(money, decimal("1200000", "EUR"), true)).toBe("€1.2M");
    expect(text(money, decimal("342000", "EUR"))).toBe("€342,000.00");
  });

  it("keeps plain numbers in full even when compact", () => {
    expect(text(number, decimal("1050", null), true)).toBe("1,050");
  });
});
