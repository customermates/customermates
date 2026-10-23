import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  getChartColors,
  getChartMatchedColors,
  getChartRankShades,
  getChartStrokeColors,
  getChartTextColors,
} from "@/constants/chart-colors";
import { chartAccentSwatches } from "@/styles/color-palettes";
import { ChartColor } from "@/features/widget/widget.schema";

type Theme = "light" | "dark";

const PREVIOUS_RAMPS: Record<string, Record<Theme, string[]> & { text: Record<Theme, string> }> = {
  default: {
    light: ["#6b6b76", "#a3a3ad", "#d0d0d6"],
    dark: ["#a1a1aa", "#71717a", "#4a4a52"],
    text: { light: "#27272a", dark: "#f4f4f5" },
  },
  primary: {
    light: ["#5e4ae3", "#8f82ee", "#c3bcf6"],
    dark: ["#7c6df2", "#5a4fb8", "#3d3780"],
    text: { light: "#2d236c", dark: "#ebe8fc" },
  },
  info: {
    light: ["#2f6fdf", "#7aa6ef", "#bad2f8"],
    dark: ["#5b9bf5", "#3f72b8", "#2b4f80"],
    text: { light: "#173a7a", dark: "#dbe8fd" },
  },
  violet: {
    light: ["#8a4fd1", "#b48ae4", "#dac6f3"],
    dark: ["#b083f0", "#8460b8", "#594080"],
    text: { light: "#45206f", dark: "#f1e6fd" },
  },
  secondary: {
    light: ["#14918c", "#5fb5b1", "#a8d8d5"],
    dark: ["#2bb3ad", "#1f8581", "#175a57"],
    text: { light: "#094644", dark: "#d4efed" },
  },
  success: {
    light: ["#2f9e6a", "#6cc196", "#b0dfc6"],
    dark: ["#3fbf85", "#2d8c62", "#1f5e43"],
    text: { light: "#17543a", dark: "#d3f2e3" },
  },
  warning: {
    light: ["#d8901f", "#e9b765", "#f3d7a6"],
    dark: ["#e8a83c", "#b07f2e", "#735522"],
    text: { light: "#6b4308", dark: "#fbebcf" },
  },
  danger: {
    light: ["#d5534e", "#e68d89", "#f1c1be"],
    dark: ["#e8706b", "#ad524e", "#723835"],
    text: { light: "#6e211e", dark: "#fbdcda" },
  },
};

function rankSteps(values: number[]) {
  const order = values.map((value, index) => ({ value, index })).sort((left, right) => right.value - left.value);
  const ranks = new Map(order.map(({ index }, rank) => [index, rank]));
  const span = Math.min(6, (values.length - 1) * 2);
  return values.map((_, index) =>
    values.length > 1 ? Math.round(((ranks.get(index) ?? 0) / (values.length - 1)) * span) : 0,
  );
}

function luminance(hex: string) {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(left: string, right: string) {
  const [high, low] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}

const css = readFileSync(join(process.cwd(), "styles/globals.css"), "utf8");

function themeTokens(selector: string) {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf("\n}", start));
  return new Map([...body.matchAll(/^ {2}(--[\w-]+): ([^;]+);$/gm)].map(([, name, value]) => [name, value]));
}

const THEMES: Record<Theme, Map<string, string>> = {
  light: themeTokens('.dark [data-marketing-tone="inverse"]'),
  dark: themeTokens('.light [data-marketing-tone="inverse"]'),
};

function resolve(value: string, theme: Theme): string {
  const reference = /^var\((--[\w-]+)\)$/.exec(value);
  if (!reference) return value;
  const token = THEMES[theme].get(reference[1]);
  if (!token) throw new Error(`Missing ${reference[1]} in the ${theme} theme`);
  return resolve(token, theme);
}

const COLORS = Object.values(ChartColor);
const THEME_NAMES: Theme[] = ["light", "dark"];

describe("chart colors", () => {
  it("resolve to the previous fills, strokes and label colors in both themes", () => {
    for (const theme of THEME_NAMES) {
      for (const color of COLORS) {
        const ramp = PREVIOUS_RAMPS[color.replace(/\d$/, "")];
        const step = Number(color.slice(-1)) - 1;
        expect(resolve(getChartColors()[color], theme)).toBe(ramp[theme][step]);
        expect(resolve(getChartStrokeColors()[color], theme)).toBe(ramp[theme][step]);
        expect(resolve(getChartTextColors()[color], theme)).toBe(ramp.text[theme]);
      }
    }
  });

  it("spread rank shades over the ramp for every hue, count and tie", () => {
    const series = [[1], [5, 3], [3, 5], [10, 40, 20, 30], [2, 2, 1], [7, 7, 7, 7], [9, 1, 8, 2, 7, 3, 6, 4, 5], []];
    for (const color of COLORS) {
      const hue = color.replace(/\d$/, "");
      for (const values of series) {
        expect(getChartRankShades(color, values)).toEqual(
          rankSteps(values).map((step) => `var(--chart-${hue}-rank-${step})`),
        );
      }
    }
  });

  it("step each ramp from the strongest fill toward the background, readable on cards in both themes", () => {
    const cards: Record<Theme, string> = { light: "#ffffff", dark: "#151518" };
    for (const theme of THEME_NAMES) {
      for (const hue of Object.keys(PREVIOUS_RAMPS)) {
        const ramp = [0, 1, 2, 3, 4, 5, 6].map((step) => resolve(`var(--chart-${hue}-rank-${step})`, theme));
        expect(ramp[0]).toBe(PREVIOUS_RAMPS[hue][theme][0]);
        for (let step = 1; step < ramp.length; step++) {
          const closer = contrast(ramp[step], cards[theme]) < contrast(ramp[step - 1], cards[theme]);
          expect(closer).toBe(true);
          expect(contrast(ramp[step], ramp[step - 1])).toBeGreaterThan(1.05);
        }
        expect(contrast(ramp[6], cards[theme])).toBeGreaterThan(theme === "light" ? 1.35 : 2);
      }
    }
  });

  it("keep no-value groups on one neutral grey and rank only the other groups", () => {
    expect(getChartRankShades(ChartColor.info1, [4, 9, 2], [false, true, false])).toEqual([
      "var(--chart-info-rank-0)",
      "var(--chart-default-rank-3)",
      "var(--chart-info-rank-2)",
    ]);
  });

  it("match the accent swatches to the strongest light fill of each accent hue", () => {
    for (const [color, hex] of Object.entries(chartAccentSwatches))
      expect(resolve(getChartColors()[color as ChartColor], "light")).toBe(hex);
  });

  it("gives the largest value the strongest shade and steps toward the softest", () => {
    const shades = getChartRankShades(ChartColor.primary1, [10, 40, 20, 30]);
    expect(shades[1]).toBe("var(--chart-primary-rank-0)");
    expect(new Set(shades).size).toBe(4);
    expect(getChartRankShades(ChartColor.secondary2, [1])).toEqual(["var(--chart-secondary-rank-0)"]);
    expect(getChartRankShades("unknown1" as ChartColor, [1])).toEqual(["var(--chart-primary-rank-0)"]);
  });

  it("give doughnut groups a matched set of distinct hues around the accent, largest first", () => {
    expect(getChartMatchedColors(ChartColor.primary1, [3, 9, 1, 5])).toEqual([
      "var(--chart-secondary-1)",
      "var(--chart-primary-1)",
      "var(--chart-default-1)",
      "var(--chart-info-1)",
    ]);
    expect(getChartMatchedColors(ChartColor.violet1, [6, 5, 4, 3, 2, 1], [false, false, true])).toEqual([
      "var(--chart-violet-1)",
      "var(--chart-info-1)",
      "var(--chart-default-rank-3)",
      "var(--chart-secondary-1)",
      "var(--chart-default-1)",
      "var(--chart-violet-2)",
    ]);
    for (const color of COLORS) {
      const fills = getChartMatchedColors(color, [4, 3, 2, 1]);
      expect(new Set(fills).size).toBe(4);
      for (const fill of fills) for (const theme of THEME_NAMES) expect(resolve(fill, theme)).toMatch(/^#/);
    }
  });

  it("keep the shared chart tokens on the strongest step of each hue", () => {
    for (const theme of THEME_NAMES) {
      expect([1, 2, 3, 4, 5].map((index) => resolve(`var(--chart-${index})`, theme))).toEqual(
        ["primary", "secondary", "success", "warning", "danger"].map((hue) => PREVIOUS_RAMPS[hue][theme][0]),
      );
    }
  });
});
