import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { RecordGroupSummaryResult } from "@/features/records/record-grouping.schema";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formattingLocale: "en-US" }),
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
  TooltipContent: () => null,
}));

import { GroupSummaries } from "../group-summaries";

const summary = (result: RecordGroupSummaryResult["result"]): RecordGroupSummaryResult => ({
  fieldId: randomUUID(),
  label: "Budget",
  aggregation: "sum",
  decimalPlaces: 2,
  result,
});

describe("group summary presentation", () => {
  it("formats decimal strings beyond the safe integer range without converting them to binary numbers", () => {
    const html = renderToStaticMarkup(
      createElement(GroupSummaries, {
        summaries: [
          summary({ state: "value", value: { kind: "decimal", value: "9007199254740993.125", currency: "EUR" } }),
        ],
      }),
    );
    expect(html).toContain("€9,007,199,254,740,993.13");
    expect(html).toContain("Budget · RecordModel.reducers.sum");
  });
  it("keeps compact totals to one decimal while retaining the full configured precision in the label", () => {
    const html = renderToStaticMarkup(
      createElement(GroupSummaries, {
        compact: true,
        summaries: [
          {
            ...summary({ state: "value", value: { kind: "decimal", value: "1234567.1259", currency: "EUR" } }),
            decimalPlaces: 4,
          },
        ],
      }),
    );
    expect(html).toContain(">€1.2M<");
    expect(html).toContain('aria-label="Budget · RecordModel.reducers.sum: €1,234,567.1259"');
  });
  it("keeps zero, missing, restricted and failed summaries visibly different", () => {
    const html = renderToStaticMarkup(
      createElement(GroupSummaries, {
        summaries: [
          summary({ state: "value", value: { kind: "decimal", value: "0", currency: null } }),
          summary({ state: "missing" }),
          summary({ state: "restricted" }),
          summary({ state: "error", code: "currency_mismatch" }),
        ],
      }),
    );
    expect(html).toContain(">0<");
    expect(html).toContain('aria-label="Budget · RecordModel.reducers.sum: RecordModel.missing"');
    expect(html).not.toContain("—");
    expect(html).toContain("RecordModel.restricted");
    expect(html).toContain("RecordModel.calculationError");
    expect(html).not.toContain("currency_mismatch");
  });
});
