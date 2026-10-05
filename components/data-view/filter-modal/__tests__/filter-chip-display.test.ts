import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const selectItems = vi.hoisted(() => vi.fn());
const formatDate = vi.hoisted(() => vi.fn((_date: Date) => "date"));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => (key === "Common.filters.unavailableValue" ? "Unavailable" : key),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formatNumericalShortDate: formatDate }),
}));
vi.mock("../inputs/use-filter-select-items", () => ({
  useFilterSelectItems: selectItems,
}));

import { FilterChipValue } from "../filter-chip-display";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

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

  describe("date values", () => {
    const customField = "285c0f4d-c5e8-4fe2-a288-f86f9985718f";
    const cases = [
      {
        zone: "Europe/Berlin",
        values: ["2026-09-30T22:00:00.000Z", "2026-10-02T22:00:00.000Z"],
        labels: ["10/01/26", "10/03/26"],
      },
      {
        zone: "America/Los_Angeles",
        values: ["2026-10-01T00:30:00.000Z", "2026-10-03T00:30:00.000Z"],
        labels: ["09/30/26", "10/02/26"],
      },
      {
        zone: "Asia/Tokyo",
        values: ["2026-10-01T18:00:00.000Z", "2026-10-03T18:00:00.000Z"],
        labels: ["10/02/26", "10/04/26"],
      },
    ];

    function setZone(zone: string) {
      vi.stubEnv("TZ", zone);
      selectItems.mockReturnValue({ items: [], getItems: undefined, isLoading: false });
      formatDate.mockImplementation((date) =>
        new Intl.DateTimeFormat("en-US", {
          timeZone: zone,
          year: "2-digit",
          month: "2-digit",
          day: "2-digit",
        }).format(date),
      );
    }

    for (const field of ["createdAt", "lastMessageAt", "lastMessageSentAt", customField]) {
      it.each(cases)(`preserves timestamp boundaries for ${field} in $zone`, ({ zone, values, labels }) => {
        setZone(zone);
        const html = renderToStaticMarkup(
          createElement(FilterChipValue, {
            customColumns: [{ id: customField, type: "dateTimeRange" }] as never,
            filter: { field, operator: "between", value: values } as never,
          }),
        );

        expect(html).toContain(labels.join(", "));
        expect(formatDate.mock.calls.map(([date]) => date.getTime())).toEqual(values.map((value) => Date.parse(value)));
      });
    }

    for (const type of ["date", "dateRange"]) {
      it.each(cases)(`preserves calendar-only ${type} values in $zone`, ({ zone }) => {
        setZone(zone);
        const html = renderToStaticMarkup(
          createElement(FilterChipValue, {
            customColumns: [{ id: customField, type }] as never,
            filter: {
              field: customField,
              operator: "between",
              value: ["2026-10-01T00:00:00.000Z", "2026-10-03T00:00:00.000Z"],
            } as never,
          }),
        );

        expect(html).toContain("10/01/26, 10/03/26");
      });
    }

    it("preserves plain calendar dates without treating them as timestamps", () => {
      setZone("America/Los_Angeles");
      const html = renderToStaticMarkup(
        createElement(FilterChipValue, {
          customColumns: [{ id: customField, type: "dateRange" }] as never,
          filter: { field: customField, operator: "between", value: ["2026-10-01", "2026-10-03"] } as never,
        }),
      );

      expect(html).toContain("2026-10-01, 2026-10-03");
      expect(formatDate).not.toHaveBeenCalled();
    });
  });
});
