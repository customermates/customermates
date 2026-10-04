import type { Root } from "react-dom/client";
import type { ChartDataPoint } from "../chart.types";
import type { ReactElement } from "react";

import { act, cloneElement, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("framer-motion", () => ({ useReducedMotion: () => true }));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formattingLocale: "en-US", formatNumber: (value: number) => String(value) }),
}));
vi.mock("../dashboard-chart-container", () => ({
  DashboardChartContainer: ({ children }: { children: ReactElement }) =>
    cloneElement(children as ReactElement<{ width: number; height: number }>, { width: 480, height: 240 }),
}));

import { AreaTimeChart } from "../area-time-chart";
import { FunnelChart } from "../funnel-chart";

let root: Root;
let container: HTMLElement;

const point = (label: string, value: number, extra: Partial<ChartDataPoint> = {}): ChartDataPoint => ({
  label,
  value,
  fill: "#336699",
  color: "#336699",
  labelColor: "#ffffff",
  strokeColor: "#224466",
  ...extra,
});

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("time series and funnel charts", () => {
  it("draws an area with short axis labels and breaks the line at missing periods", async () => {
    await act(async () => {
      root.render(
        createElement(AreaTimeChart, {
          currency: "EUR",
          chartData: [
            point("January 2026", 5, { axisLabel: "Jan 26" }),
            point("February 2026", 0, { axisLabel: "Feb 26", missing: true }),
            point("March 2026", 2, { axisLabel: "Mar 26" }),
          ],
          colors: ["#336699"],
          strokeColors: ["#224466"],
          gridColor: "var(--border)",
          textColor: "var(--muted-foreground)",
        }),
      );
      await Promise.resolve();
    });
    const curve = container.querySelector(".recharts-area-curve")?.getAttribute("d") ?? "";
    expect(container.querySelector(".recharts-area-area")).not.toBeNull();
    expect(curve.match(/M/g)?.length).toBe(2);
    const ticks = [...container.querySelectorAll(".recharts-xAxis-tick-labels text")].map((tick) => tick.textContent);
    expect(ticks).toEqual(["Jan 26", "Feb 26", "Mar 26"]);
  });

  it("centers narrowing bars and labels each step with its value and conversion", async () => {
    await act(async () => {
      root.render(
        createElement(FunnelChart, {
          currency: null,
          textColor: "var(--muted-foreground)",
          chartData: [
            point("New", 10, { detail: "10" }),
            point("Qualified", 5, { detail: "5 · 50%" }),
            point("Won", 2, { detail: "2 · 40%" }),
          ],
        }),
      );
      await Promise.resolve();
    });
    const rectangles = [...container.querySelectorAll(".recharts-bar-rectangle path")];
    const spacers = rectangles.filter((bar) => bar.getAttribute("fill") === "transparent");
    const values = rectangles.filter((bar) => bar.getAttribute("fill") === "#336699");
    expect(spacers).toHaveLength(2);
    expect(values).toHaveLength(3);
    const geometry = values.map((bar) => ({
      x: Number(bar.getAttribute("x")),
      width: Number(bar.getAttribute("width")),
    }));
    expect(geometry[0].width).toBeGreaterThan(geometry[1].width);
    expect(geometry[1].width).toBeGreaterThan(geometry[2].width);
    for (const bar of geometry) expect(bar.x + bar.width / 2).toBeCloseTo(geometry[0].x + geometry[0].width / 2, 5);
    const ticks = [...container.querySelectorAll(".recharts-yAxis-tick-labels text")].map((tick) => tick.textContent);
    expect(ticks).toEqual(expect.arrayContaining(["New", "Qualified", "Won", "10", "5 · 50%", "2 · 40%"]));
  });
});
