import type { ComponentType, ReactNode } from "react";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Bar, BarChart } from "recharts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardChartContainer } from "../dashboard-chart-container";

const CHART_MODULES = [
  "doughnut-chart.tsx",
  "horizontal-bar-chart-with-labels.tsx",
  "horizontal-bar-chart.tsx",
  "radar-chart.tsx",
  "vertical-bar-chart-with-labels.tsx",
  "vertical-bar-chart.tsx",
];

const DashboardChartContainerForTest = DashboardChartContainer as ComponentType<{ children?: ReactNode }>;

describe("DashboardChartContainer", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders real Recharts content without the negative initial-size warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const chart = createElement(
      BarChart,
      { data: [{ label: "Example", value: 1 }] },
      createElement(Bar, { dataKey: "value" }),
    );

    renderToStaticMarkup(createElement(DashboardChartContainerForTest, null, chart));

    expect(warn).not.toHaveBeenCalled();
  });

  it.each(CHART_MODULES)("keeps %s behind the shared sizing policy", (file) => {
    const source = readFileSync(join(__dirname, "..", file), "utf8");

    expect(source).toContain('import { DashboardChartContainer } from "./dashboard-chart-container";');
    expect(source).not.toContain("ResponsiveContainer");
  });
});
