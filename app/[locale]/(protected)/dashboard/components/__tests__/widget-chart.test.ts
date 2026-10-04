import type { Root } from "react-dom/client";
import type { ReactElement } from "react";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChartColor, DisplayType } from "@/features/widget/widget.schema";

const chartMocks = vi.hoisted(() => ({
  calls: [] as Array<{ chart: string; props: Record<string, unknown> }>,
  nextDynamicIndex: 0,
}));

vi.mock("next/dynamic", () => ({
  default: () => {
    const chart = [
      "vertical",
      "horizontal",
      "verticalWithLabels",
      "horizontalWithLabels",
      "area",
      "funnel",
      "doughnut",
      "radar",
    ][chartMocks.nextDynamicIndex++];

    return (props: Record<string, unknown>) => {
      chartMocks.calls.push({ chart, props });
      return null;
    };
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => (key === "Diagrams.noGroup" ? "No group" : key),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "dark" }),
}));

vi.mock("@/constants/chart-colors", () => {
  const palette = (prefix: string) => ({
    [ChartColor.primary1]: `${prefix}-primary1`,
    [ChartColor.primary2]: `${prefix}-primary2`,
    [ChartColor.secondary1]: `${prefix}-secondary1`,
    [ChartColor.danger2]: `${prefix}-danger2`,
    [ChartColor.success1]: `${prefix}-success1`,
  });

  return {
    getChartColors: () => palette("fill"),
    getChartStrokeColors: () => palette("stroke"),
    getChartTextColors: () => palette("text"),
  };
});

import { WidgetChart } from "../widget-chart";

const roots: Root[] = [];
const containers: HTMLElement[] = [];

function mount(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(element));
}

function renderChart(displayType: DisplayType, overrides: Partial<React.ComponentProps<typeof WidgetChart>> = {}) {
  chartMocks.calls.length = 0;
  mount(
    createElement(WidgetChart, {
      currency: "EUR",
      data: [
        {
          labelKind: "system",
          systemLabelKey: "noGroup",
          optionColor: "success",
          value: 200,
        },
        { labelKind: "literal", label: "Hardware", value: 100 },
      ],
      displayOptions: {
        barColors: [ChartColor.danger2, ChartColor.secondary1],
        displayType,
        reverseXAxis: true,
        reverseYAxis: true,
        showFilters: true,
        showLegend: false,
        useGroupColors: true,
      },
      ...overrides,
    }),
  );

  expect(chartMocks.calls).toHaveLength(1);
  return chartMocks.calls[0];
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  for (const container of containers.splice(0)) container.remove();
});

describe("WidgetChart", () => {
  it.each([
    [DisplayType.verticalBarChart, "vertical"],
    [DisplayType.horizontalBarChart, "horizontal"],
    [DisplayType.verticalBarChartWithLabels, "verticalWithLabels"],
    [DisplayType.horizontalBarChartWithLabels, "horizontalWithLabels"],
    [DisplayType.doughnutChart, "doughnut"],
    [DisplayType.radarChart, "radar"],
    [DisplayType.areaChart, "area"],
  ])("renders %s through the expected chart implementation", (displayType, expectedChart) => {
    const call = renderChart(displayType);

    expect(call.chart).toBe(expectedChart);
    expect(call.props).toMatchObject({
      currency: "EUR",
      reverseXAxis: true,
      reverseYAxis: true,
    });
  });

  it("colors a time series with the configured color and passes period details through", () => {
    const call = renderChart(DisplayType.areaChart, {
      data: [{ labelKind: "literal", label: "January 2026", axisLabel: "Jan 26", missing: true, value: 0 }],
    });
    expect(call.props.colors).toEqual(["fill-danger2", "fill-secondary1"]);
    expect(call.props.strokeColors).toEqual(["stroke-danger2", "stroke-secondary1"]);
    expect(call.props.chartData).toMatchObject([{ label: "January 2026", axisLabel: "Jan 26", missing: true }]);
  });

  it("asks value axes for whole-number ticks only when the series holds integers", () => {
    expect(renderChart(DisplayType.verticalBarChart, { integerValues: true }).props.allowDecimals).toBe(false);
    expect(renderChart(DisplayType.horizontalBarChart, { integerValues: true }).props.allowDecimals).toBe(false);
    expect(renderChart(DisplayType.areaChart, { integerValues: true }).props.allowDecimals).toBe(false);
    expect(renderChart(DisplayType.verticalBarChart).props.allowDecimals).toBe(true);
  });

  it("renders funnels with each step's group color and conversion detail", () => {
    const call = renderChart(DisplayType.funnelChart, {
      data: [
        { labelKind: "literal", label: "New", optionColor: "success", value: 4, detail: "4" },
        { labelKind: "literal", label: "Won", value: 1, detail: "1 · 25%" },
      ],
    });
    expect(call.chart).toBe("funnel");
    expect(call.props.chartData).toMatchObject([
      { label: "New", fill: "fill-success1", detail: "4" },
      { label: "Won", fill: "fill-secondary1", detail: "1 · 25%" },
    ]);
  });

  it.each(["EUR", "USD", null])("forwards the %s formatting currency to the chart", (currency) => {
    const call = renderChart(DisplayType.verticalBarChart, { currency });
    expect(call.props.currency).toBe(currency);
  });

  it("maps option colors, fallback colors, labels, and strokes into chart data", () => {
    const call = renderChart(DisplayType.verticalBarChart);

    expect(call.props.chartData).toEqual([
      {
        color: "fill-success1",
        fill: "fill-success1",
        label: "No group",
        labelColor: "text-success1",
        strokeColor: "stroke-success1",
        value: 200,
      },
      {
        color: "fill-secondary1",
        fill: "fill-secondary1",
        label: "Hardware",
        labelColor: "text-secondary1",
        strokeColor: "stroke-secondary1",
        value: 100,
      },
    ]);
    expect(call.props.colors).toEqual(["fill-success1", "fill-secondary1"]);
  });

  it("uses configured colors for every group when option colors are disabled", () => {
    const call = renderChart(DisplayType.verticalBarChart, {
      displayOptions: {
        barColors: [ChartColor.danger2, ChartColor.secondary1],
        displayType: DisplayType.verticalBarChart,
        useGroupColors: false,
      },
    });

    expect((call.props.chartData as Array<{ fill: string }>).map(({ fill }) => fill)).toEqual([
      "fill-danger2",
      "fill-secondary1",
    ]);
    expect(call.props.colors).toEqual(["fill-danger2", "fill-secondary1"]);
  });

  it("falls back to the primary color when a saved color list is empty", () => {
    const call = renderChart(DisplayType.verticalBarChart, {
      displayOptions: {
        barColors: [],
        displayType: DisplayType.verticalBarChart,
        useGroupColors: false,
      },
    });

    expect((call.props.chartData as Array<{ fill: string }>).map(({ fill }) => fill)).toEqual([
      "fill-primary1",
      "fill-primary1",
    ]);
    expect(call.props.colors).toEqual(["fill-primary1"]);
  });

  it("keeps legacy widgets without display options on the vertical primary-color default", () => {
    const call = renderChart(DisplayType.radarChart, { displayOptions: null });

    expect(call.chart).toBe("vertical");
    expect((call.props.chartData as Array<{ fill: string }>).map(({ fill }) => fill)).toEqual([
      "fill-success1",
      "fill-primary1",
    ]);
    expect(call.props.colors).toEqual(["fill-success1", "fill-primary1"]);
  });

  it("passes the legend choice only to the doughnut chart", () => {
    const doughnut = renderChart(DisplayType.doughnutChart);
    const vertical = renderChart(DisplayType.verticalBarChart);

    expect(doughnut.props.showLegend).toBe(false);
    expect(vertical.props).not.toHaveProperty("showLegend");
  });
});
