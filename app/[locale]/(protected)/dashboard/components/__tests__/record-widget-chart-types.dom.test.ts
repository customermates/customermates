import type { Root } from "react-dom/client";
import type { RecordWidgetChartProps } from "../record-widget-chart";
import type { RecordMeasureResult } from "@/features/records/record-measure.schema";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChartColor, DisplayType } from "@/features/widget/widget.schema";

const chartMocks = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>>, locale: "en-US" }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}${JSON.stringify(values)}` : key,
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formattingLocale: chartMocks.locale }),
}));
vi.mock("../widget-chart", () => ({
  WidgetChart: (props: Record<string, unknown>) => {
    chartMocks.calls.push(props);
    return createElement("div", {
      "data-chart": String((props.displayOptions as { displayType: string }).displayType),
    });
  },
}));

import { RecordWidgetChart } from "../record-widget-chart";

const DEAL = "9c9f1c8e-6a7c-4a4b-9a77-9d1d3d2f7d01";
const STAGE = "9c9f1c8e-6a7c-4a4b-9a77-9d1d3d2f7d02";
const CLOSE = "9c9f1c8e-6a7c-4a4b-9a77-9d1d3d2f7d03";
let root: Root;
let container: HTMLElement;

const euro = (value: string) => ({
  state: "value" as const,
  value: { kind: "decimal" as const, value, currency: "EUR" },
});
const plain = (value: string) => ({
  state: "value" as const,
  value: { kind: "decimal" as const, value, currency: null },
});
const day = (value: string) => ({ state: "value" as const, value: { kind: "date" as const, value } });
const option = (value: string) => ({ state: "value" as const, value: { kind: "select" as const, value } });
const group = (
  label: RecordMeasureResult["groups"][number]["label"],
  result: RecordMeasureResult["groups"][number]["result"],
  count: number | null = 1,
) => ({ record: null, fieldId: null, label, count, result });

function render(props: Partial<RecordWidgetChartProps> & Pick<RecordWidgetChartProps, "data" | "measure">) {
  chartMocks.calls.length = 0;
  act(() =>
    root.render(
      createElement(RecordWidgetChart, {
        name: "Widget",
        status: "ready",
        groupOptions: [],
        displayOptions: { displayType: DisplayType.verticalBarChart, barColors: [ChartColor.primary1] },
        ...props,
      }),
    ),
  );
  return container;
}

function measure(
  groupBy: RecordWidgetChartProps["measure"]["groupBy"],
  aggregation: "count" | "sum" | "average" = "sum",
) {
  return {
    source: { typeId: DEAL, filters: [], relationships: [] },
    aggregation,
    valueFieldId: aggregation === "count" ? null : CLOSE,
    groupBy,
    groupLimit: 100,
  } as RecordWidgetChartProps["measure"];
}

function result(total: RecordMeasureResult["total"], groups: RecordMeasureResult["groups"]): RecordMeasureResult {
  return { schemaRevision: 1, attribution: "full", total, groups };
}

beforeEach(() => {
  chartMocks.locale = "en-US";
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("record widget display types", () => {
  it("shows one exact number with currency, zero and an em dash for missing values", () => {
    const number = { displayType: DisplayType.number };
    const view = render({
      displayOptions: number,
      measure: measure(null),
      data: result({ count: 3, result: euro("12345678901234567890.12") }, []),
      name: "Open pipeline",
    });
    expect(view.querySelector("h2")?.textContent).toBe("Open pipeline");
    expect(view.querySelector('[data-slot="widget-number"]')?.textContent).toBe(
      '€12,345,678,901,234,567,890.12RecordWidgets.recordCount{"count":3}',
    );
    render({ displayOptions: number, measure: measure(null), data: result({ count: 0, result: euro("0") }, []) });
    expect(view.querySelector('[data-slot="widget-number"] p')?.textContent).toBe("€0.00");
    render({
      displayOptions: number,
      measure: measure(null, "count"),
      data: result({ count: 0, result: plain("0") }, []),
    });
    expect(view.querySelector('[data-slot="widget-number"] p')?.textContent).toBe("0");
    render({
      displayOptions: number,
      measure: measure(null, "average"),
      data: result({ count: 2, result: { state: "missing" } }, []),
    });
    expect(view.querySelector('[data-slot="widget-number"] p')?.textContent).toBe("—");
    render({
      displayOptions: number,
      measure: measure(null),
      data: result({ count: 2, result: { state: "restricted" } }, []),
    });
    expect(view.querySelector('[data-slot="widget-number"] p')?.textContent).toBe("RecordModel.restricted");
    expect(chartMocks.calls).toHaveLength(0);
  });

  it("ranks groups by value with shares of the total and summarizes truncated groups", () => {
    const groups = Array.from({ length: 12 }, (_, index) =>
      group({ state: "value", value: { kind: "text", value: `Org ${index + 1}` } }, euro(String((index + 1) * 10))),
    );
    groups.push(group({ state: "missing" }, { state: "restricted" }));
    const view = render({
      displayOptions: { displayType: DisplayType.rankedTable },
      measure: measure({ path: [], fieldId: null }),
      data: result({ count: 13, result: euro("1000") }, groups),
    });
    const rows = [...view.querySelectorAll("tbody tr")].map((row) =>
      [...row.querySelectorAll("td, th")].map((cell) => cell.textContent),
    );
    expect(rows).toHaveLength(10);
    expect(rows[0]).toEqual(["1", "Org 12", "€120.00", "12%"]);
    expect(rows[1]).toEqual(["2", "Org 11", "€110.00", "11%"]);
    expect(rows[9]).toEqual(["10", "Org 3", "€30.00", "3%"]);
    expect(view.textContent).toContain('RecordWidgets.ranked.more{"count":3}');
    expect(chartMocks.calls).toHaveLength(0);
  });

  it("fills empty periods with zero for sums and leaves gaps for averages", () => {
    const groupBy = { path: [], fieldId: CLOSE, dateInterval: "month" as const };
    const data = result({ count: 6, result: euro("7") }, [
      group(day("2026-01-01"), euro("5"), 2),
      group(day("2026-04-01"), euro("2"), 1),
      group({ state: "missing" }, euro("9"), 3),
    ]);
    const view = render({ displayOptions: { displayType: DisplayType.areaChart }, measure: measure(groupBy), data });
    const sum = chartMocks.calls[0].data as Array<Record<string, unknown>>;
    expect(
      sum.map(({ label, axisLabel, value, missing, formattedValue }) => [
        label,
        axisLabel,
        value,
        missing,
        formattedValue,
      ]),
    ).toEqual([
      ["January 2026", "Jan 2026", 5, false, "€5.00"],
      ["February 2026", "Feb 2026", 0, false, "€0.00"],
      ["March 2026", "Mar 2026", 0, false, "€0.00"],
      ["April 2026", "Apr 2026", 2, false, "€2.00"],
    ]);
    expect(view.querySelector('[data-slot="widget-chart-notes"]')?.textContent).toBe(
      'RecordWidgets.withoutDate{"count":3}',
    );
    render({ displayOptions: { displayType: DisplayType.areaChart }, measure: measure(groupBy, "average"), data });
    const average = chartMocks.calls[0].data as Array<Record<string, unknown>>;
    expect(average.map(({ missing, formattedValue }) => [missing, formattedValue])).toEqual([
      [false, "€5.00"],
      [true, "RecordWidgets.noRecordsInPeriod"],
      [true, "RecordWidgets.noRecordsInPeriod"],
      [false, "€2.00"],
    ]);
    render({
      displayOptions: { displayType: DisplayType.areaChart },
      measure: measure({ ...groupBy, dateInterval: "quarter" }),
      data: result({ count: 2, result: euro("3") }, [
        group(day("2026-01-01"), euro("1")),
        group(day("2026-07-01"), euro("2")),
      ]),
    });
    expect((chartMocks.calls[0].data as Array<{ label: string }>).map(({ label }) => label)).toEqual([
      'RecordWidgets.quarterLabel{"quarter":1,"year":2026}',
      'RecordWidgets.quarterLabel{"quarter":2,"year":2026}',
      'RecordWidgets.quarterLabel{"quarter":3,"year":2026}',
    ]);
  });

  it("falls back to the list when a time series is not grouped by interval or holds restricted periods", () => {
    const view = render({
      displayOptions: { displayType: DisplayType.areaChart },
      measure: measure({ path: [], fieldId: CLOSE, dateInterval: "week" }),
      data: result({ count: 2, result: { state: "restricted" } }, [
        group(day("2026-01-05"), { state: "restricted" }),
        group(day("2026-01-12"), euro("1")),
      ]),
    });
    expect(chartMocks.calls).toHaveLength(0);
    expect([...view.querySelectorAll("dt")].map((cell) => cell.textContent)).toEqual([
      'RecordWidgets.weekOf{"date":"Jan 5, 2026"}',
      'RecordWidgets.weekOf{"date":"Jan 12, 2026"}',
    ]);
  });

  it("orders funnel steps by option order with step conversion and hides records without a stage", () => {
    const groupOptions = ["New", "Qualified", "Proposal", "Won"].map((label) => ({ id: label, label, color: null }));
    const view = render({
      displayOptions: { displayType: DisplayType.funnelChart },
      groupOptions,
      measure: measure({ path: [], fieldId: STAGE }, "count"),
      data: result({ count: 22, result: plain("22") }, [
        group(option("Proposal"), plain("4"), 4),
        group(option("New"), plain("10"), 10),
        group(option("Won"), plain("2"), 2),
        group({ state: "missing" }, plain("6"), 6),
      ]),
    });
    const steps = chartMocks.calls[0].data as Array<Record<string, unknown>>;
    expect(steps.map(({ label, value, detail }) => [label, value, detail])).toEqual([
      ["New", 10, "10"],
      ["Qualified", 0, "0 · 0%"],
      ["Proposal", 4, "4"],
      ["Won", 2, "2 · 50%"],
    ]);
    expect(steps[3].formattedValue).toBe('RecordWidgets.funnelTooltip{"value":"2","conversion":"50%"}');
    expect(view.querySelector('[data-slot="widget-chart-notes"]')?.textContent).toBe(
      'RecordWidgets.withoutValue{"count":6}',
    );
  });

  it("labels periods unambiguously in English and German", () => {
    const periods = (dateInterval: "day" | "week" | "month" | "quarter", starts: string[]) => {
      render({
        displayOptions: { displayType: DisplayType.areaChart },
        measure: measure({ path: [], fieldId: CLOSE, dateInterval }, "count"),
        data: result(
          { count: starts.length, result: plain(String(starts.length)) },
          starts.map((start) => group(day(start), plain("1"))),
        ),
      });
      return (chartMocks.calls[0].data as Array<{ axisLabel: string; label: string }>).map(({ axisLabel, label }) => [
        axisLabel,
        label,
      ]);
    };
    expect(periods("month", ["2026-01-01"])).toEqual([["Jan 2026", "January 2026"]]);
    expect(periods("quarter", ["2026-10-01"])).toEqual([
      ['RecordWidgets.quarterLabel{"quarter":4,"year":2026}', 'RecordWidgets.quarterLabel{"quarter":4,"year":2026}'],
    ]);
    expect(periods("week", ["2026-12-28", "2027-01-04"]).map(([axis]) => axis)).toEqual([
      'RecordWidgets.weekShort{"week":53,"year":2026}',
      'RecordWidgets.weekShort{"week":1,"year":2027}',
    ]);
    expect(periods("day", ["2026-01-05"])).toEqual([["Jan 5", "Jan 5, 2026"]]);
    expect(periods("day", ["2026-12-31", "2027-01-01"]).map(([axis]) => axis)).toEqual(["Dec 31, 2026", "Jan 1, 2027"]);
    chartMocks.locale = "de-DE";
    expect(periods("month", ["2026-01-01"])).toEqual([["Jan. 2026", "Januar 2026"]]);
    expect(periods("day", ["2026-01-05"])).toEqual([["5. Jan.", "05.01.2026"]]);
    expect(periods("day", ["2026-12-31", "2027-01-01"]).map(([axis]) => axis)).toEqual([
      "31. Dez. 2026",
      "1. Jan. 2027",
    ]);
  });

  it("asks for whole-number axes only for counts and integer series without currency", () => {
    const groupBy = { path: [], fieldId: CLOSE, dateInterval: "month" as const };
    const integers = (
      aggregation: "count" | "sum" | "average",
      value: (amount: string) => RecordMeasureResult["groups"][number]["result"],
    ) => {
      render({
        displayOptions: { displayType: DisplayType.areaChart },
        measure: measure(groupBy, aggregation),
        data: result({ count: 3, result: value("3") }, [
          group(day("2026-01-01"), value("1"), 1),
          group(day("2026-02-01"), value("2"), 2),
        ]),
      });
      return chartMocks.calls[0].integerValues;
    };
    expect(integers("count", plain)).toBe(true);
    expect(integers("sum", plain)).toBe(true);
    expect(integers("sum", euro)).toBe(false);
    expect(integers("average", plain)).toBe(false);
    render({
      displayOptions: { displayType: DisplayType.horizontalBarChart },
      measure: measure({ path: [], fieldId: STAGE }, "sum"),
      data: result({ count: 2, result: plain("2.5") }, [
        group(option("a"), plain("1.5")),
        group(option("b"), plain("1")),
      ]),
    });
    expect(chartMocks.calls[0].integerValues).toBe(false);
  });

  it("keeps lost stages out of the funnel and only converts between forward steps", () => {
    const groupOptions = [
      ["New", "10"],
      ["Qualified", "25"],
      ["Won", "100"],
      ["Lost", "0"],
    ].map(([label, probability]) => ({ id: label, label, color: null, probability }));
    const view = render({
      displayOptions: { displayType: DisplayType.funnelChart },
      groupOptions,
      measure: measure({ path: [], fieldId: STAGE }, "count"),
      data: result({ count: 15, result: plain("15") }, [
        group(option("Lost"), plain("1"), 1),
        group(option("New"), plain("8"), 8),
        group(option("Qualified"), plain("4"), 4),
        group(option("Won"), plain("2"), 2),
      ]),
    });
    const steps = chartMocks.calls[0].data as Array<Record<string, unknown>>;
    expect(steps.map(({ label, detail }) => [label, detail])).toEqual([
      ["New", "8"],
      ["Qualified", "4 · 50%"],
      ["Won", "2 · 50%"],
    ]);
    expect(view.querySelector('[data-slot="widget-chart-notes"]')?.textContent).toBe(
      'RecordWidgets.funnelClosedStage{"label":"Lost","value":"1"}',
    );
  });
});
