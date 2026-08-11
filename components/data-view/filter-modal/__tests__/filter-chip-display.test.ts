import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const selectItems = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => (key === "Common.filters.unavailableValue" ? "Unavailable" : key),
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    intlStore: { formatNumericalShortDate: vi.fn(() => "date") },
  }),
}));
vi.mock("../inputs/use-filter-select-items", () => ({
  useFilterSelectItems: selectItems,
}));

import { FilterChipValue } from "../filter-chip-display";

describe("FilterChipValue", () => {
  it("never exposes a stale custom-option UUID", () => {
    const technicalId = "15c1df79-6c87-46f7-8de4-02a1f49c83be";
    selectItems.mockReturnValue({
      items: [],
      getItems: undefined,
      isLoading: false,
    });

    const html = renderToStaticMarkup(
      createElement(FilterChipValue, {
        customColumns: [],
        filter: {
          field: "285c0f4d-c5e8-4fe2-a288-f86f9985718f",
          operator: "in",
          value: [technicalId],
        } as never,
        label: "Field",
        operator: "is",
      }),
    );

    expect(html).toContain("Unavailable");
    expect(html).not.toContain(technicalId);
  });

  it("preserves literal customer-entered filter text", () => {
    selectItems.mockReturnValue({
      items: [],
      getItems: undefined,
      isLoading: false,
    });

    const html = renderToStaticMarkup(
      createElement(FilterChipValue, {
        customColumns: undefined,
        filter: {
          field: "url",
          operator: "equals",
          value: "https://example.test",
        } as never,
      }),
    );

    expect(html).toContain("https://example.test");
  });
});
