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
import { HorizontalBarChart } from "../horizontal-bar-chart";
import { FunnelChart } from "../funnel-chart";
import { VerticalBarChartWithLabels } from "../vertical-bar-chart-with-labels";
import { TruncatedTick, categoryXAxisLayout } from "../chart-theme";

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
  it.each([
    [false, ["0", "1", "2", "3", "4"]],
    [true, ["0", "0.75", "1.5", "2.25", "3"]],
  ])("uses whole-number value ticks unless decimals are allowed (%s)", async (allowDecimals, expected) => {
    const series = [point("Ada", 3), point("Bo", 2), point("Cy", 1)];
    await act(async () => {
      root.render(
        createElement("div", null, [
          createElement(AreaTimeChart, {
            key: "area",
            currency: null,
            chartData: series,
            colors: ["#336699"],
            strokeColors: ["#224466"],
            allowDecimals,
          }),
          createElement(HorizontalBarChart, {
            key: "bars",
            currency: null,
            chartData: series,
            colors: ["#336699"],
            allowDecimals,
          }),
        ]),
      );
      await Promise.resolve();
    });
    const ticks = (selector: string) =>
      [...container.querySelectorAll(`${selector} text`)].map((tick) => tick.textContent);
    const [area, bars] = [...container.querySelectorAll(".recharts-surface")];
    expect(area && bars).toBeTruthy();
    expect([...area.querySelectorAll(".recharts-yAxis-tick-labels text")].map((tick) => tick.textContent)).toEqual(
      expected,
    );
    expect([...bars.querySelectorAll(".recharts-xAxis-tick-labels text")].map((tick) => tick.textContent)).toEqual(
      expected,
    );
    expect(ticks(".recharts-yAxis-tick-labels").length).toBeGreaterThan(0);
  });

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

  it("keeps the smoothed area between its lowest and highest data points", async () => {
    const values = [8, 0, 0, 9, 1, 0, 12, 0];
    await act(async () => {
      root.render(
        createElement(AreaTimeChart, {
          currency: null,
          chartData: values.map((value, index) => point(`P${index}`, value)),
          colors: ["#336699"],
          strokeColors: ["#224466"],
        }),
      );
      await Promise.resolve();
    });
    const ys = (selector: string) =>
      [...(container.querySelector(selector)?.getAttribute("d") ?? "").matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map(
        (match) => Number(match[2]),
      );
    const curve = ys(".recharts-area-curve");
    const baseline = Math.max(...ys(".recharts-area-area"));
    expect(curve.length).toBeGreaterThan(values.length);
    expect(Math.max(...curve)).toBeLessThanOrEqual(baseline + 0.01);
    expect(Math.min(...curve)).toBeGreaterThan(0);
  });

  it("shortens bar value labels that do not fit and keeps the full value as a title", async () => {
    await act(async () => {
      root.render(
        createElement(VerticalBarChartWithLabels, {
          currency: "EUR",
          chartData: ["Webinar", "Google Ads", "LinkedIn Ads", "Trade fair", "Email", "Partner event"].map(
            (label, index) => point(label, 1239425.5 - index, { formattedValue: "€1,239,425.50" }),
          ),
          colors: ["#336699"],
        }),
      );
      await Promise.resolve();
    });
    const labels = [...container.querySelectorAll(".recharts-label-list text")].map((text) => text.textContent);
    expect(labels).toHaveLength(6);
    for (const label of labels) expect(label).toBe("€1.24M");
    expect(container.querySelector(".recharts-label-list title")?.textContent).toBe("€1,239,425.50");
  });

  it("angles category labels that do not fit their band and titles truncated ticks", () => {
    expect(categoryXAxisLayout(["Q1", "Q2"], 400)).toEqual({ angled: false, height: 30, overhang: 0 });
    expect(categoryXAxisLayout(["Paid search", "LinkedIn Ads", "Partner event"], 0).angled).toBe(false);
    const angled = categoryXAxisLayout(["Paid search", "LinkedIn Ads", "Partner event", "Trade fair", "Email"], 220);
    expect(angled.angled).toBe(true);
    expect(angled.height).toBeGreaterThan(30);
    expect(angled.overhang).toBeGreaterThan(0);
    const tick = (props: Record<string, unknown>) => {
      act(() => root.render(createElement("svg", null, createElement(TruncatedTick, props))));
      return {
        text: container.querySelector("text")?.textContent,
        title: container.querySelector("title")?.textContent ?? null,
        transform: container.querySelector("text")?.getAttribute("transform") ?? null,
      };
    };
    const full = "Interviews by the hiring manager panel";
    expect(tick({ x: 0, y: 0, payload: { value: full }, angled: true })).toEqual({
      text: "Interviews by…",
      title: full,
      transform: "rotate(-35)",
    });
    expect(tick({ x: 0, y: 0, payload: { value: "Email" }, angled: true }).title).toBeNull();
    expect(tick({ x: 0, y: 0, payload: { value: full }, width: 200, visibleTicksCount: 4 })).toMatchObject({
      title: full,
      transform: null,
    });
  });

  it("centers narrowing bars and labels each step with its value and conversion", async () => {
    await act(async () => {
      root.render(
        createElement(FunnelChart, {
          chartData: [
            point("New", 10, { detail: "10" }),
            point("Qualified", 5, { detail: "5 · 50%" }),
            point("Won", 2, { detail: "2 · 40%" }),
          ],
        }),
      );
      await Promise.resolve();
    });
    const steps = [...container.querySelectorAll('[data-slot="widget-funnel-step"]')];
    expect(steps.map((step) => step.textContent)).toEqual(["New10", "Qualified5 · 50%", "Won2 · 40%"]);
    const widths = [...container.querySelectorAll<HTMLElement>('[data-slot="widget-funnel-bar"]')].map((bar) =>
      Number.parseFloat(bar.style.width),
    );
    expect(widths).toEqual([100, 50, 20]);
    for (const bar of container.querySelectorAll('[data-slot="widget-funnel-bar"]'))
      expect(bar.parentElement?.className).toContain("justify-center");
  });
});
