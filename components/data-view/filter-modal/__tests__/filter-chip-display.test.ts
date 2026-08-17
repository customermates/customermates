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

  it("collapses a fully unresolved multi-value filter into one unavailable label", () => {
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
          value: ["15c1df79-6c87-46f7-8de4-02a1f49c83be", "2a81a9a5-3f43-4d0e-9f5a-11f5cf0f6da1"],
        } as never,
        label: "Field",
        operator: "is",
      }),
    );

    expect(html.match(/Unavailable/g)).toHaveLength(1);
  });

  it("tints the pending value placeholder with the chip colour and centers it", () => {
    selectItems.mockReturnValue({
      items: [],
      getItems: undefined,
      isLoading: true,
    });

    const html = renderToStaticMarkup(
      createElement(FilterChipValue, {
        customColumns: [],
        filter: {
          field: "organizationIds",
          operator: "in",
          value: ["15c1df79-6c87-46f7-8de4-02a1f49c83be"],
        } as never,
        label: "Organization",
        operator: "in",
      }),
    );

    expect(html).toContain("data-filter-value-loading");
    expect(html).toContain("bg-current/40");
    expect(html).not.toContain("bg-placeholder");
    expect(html).toContain("align-middle");
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
