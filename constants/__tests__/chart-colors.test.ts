import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  chipChartColor,
  getChartMatchedColors,
  getChartColors,
  getChartRankShades,
  getChartStrokeColors,
  getChartTextColors,
  getChartTintColors,
} from "@/constants/chart-colors";
import { CHIP_COLORS } from "@/constants/chip-colors";
import { chartAccentSwatches } from "@/styles/color-palettes";
import { ChartColor } from "@/features/widget/widget.schema";

type Theme = "light" | "dark";

const RAMPS: Record<string, Record<Theme, string[]> & { text: Record<Theme, string> }> = {
  default: {
    light: ["#6b6b76", "#a3a3ad", "#d0d0d6"],
    dark: ["#a1a1aa", "#71717a", "#4a4a52"],
    text: { light: "#27272a", dark: "#f4f4f5" },
  },
  primary: {
    light: ["#18181b", "#71717a", "#d4d4d8"],
    dark: ["#ededf0", "#a1a1aa", "#3f3f46"],
    text: { light: "#0a0a0b", dark: "#fafafa" },
  },
  info: {
    light: ["#4a4a52", "#8b8b94", "#dcdce0"],
    dark: ["#b4b4bb", "#8a8a92", "#38383e"],
    text: { light: "#27272a", dark: "#ededf0" },
  },
  violet: {
    light: ["#7a7a83", "#a6a6ae", "#e2e2e6"],
    dark: ["#8c8c94", "#6a6a72", "#323238"],
    text: { light: "#3f3f46", dark: "#e4e4e7" },
  },
  secondary: {
    light: ["#a8a8b0", "#c6c6cc", "#e9e9ec"],
    dark: ["#66666e", "#4a4a51", "#2c2c31"],
    text: { light: "#52525b", dark: "#d4d4d8" },
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
  light: themeTokens(".light"),
  dark: themeTokens(".dark"),
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
  it("resolve to the neutral and semantic fills, strokes and label colors in both themes", () => {
    for (const theme of THEME_NAMES) {
      for (const color of COLORS) {
        const ramp = RAMPS[color.replace(/\d$/, "")];
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
      for (const hue of Object.keys(RAMPS)) {
        const ramp = [0, 1, 2, 3, 4, 5, 6].map((step) => resolve(`var(--chart-${hue}-rank-${step})`, theme));
        expect(ramp[0]).toBe(RAMPS[hue][theme][0]);
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

  it("keep the semantic accent swatches on the strongest light fill of their hue", () => {
    for (const color of [ChartColor.success1, ChartColor.warning1]) {
      expect(resolve(getChartColors()[color], "light")).toBe(
        chartAccentSwatches[color as keyof typeof chartAccentSwatches],
      );
    }
  });

  it("use no violet or other accent hue outside the semantic colours", () => {
    for (const theme of THEME_NAMES) {
      for (const hue of ["default", "primary", "info", "violet", "secondary"]) {
        for (const step of [1, 2, 3]) {
          const hex = resolve(`var(--chart-${hue}-${step})`, theme);
          const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
          expect(Math.max(r, g, b) - Math.min(r, g, b), `${hue}-${step} ${theme}`).toBeLessThanOrEqual(12);
        }
      }
    }
  });

  it("keep the neutral series ramp distinguishable from each other and from cards in both themes", () => {
    const cards: Record<Theme, string> = { light: "#ffffff", dark: "#151518" };
    for (const theme of THEME_NAMES) {
      const series = getChartMatchedColors(ChartColor.primary1, [4, 3, 2, 1]).map((fill) => resolve(fill, theme));
      for (let index = 1; index < series.length; index++)
        expect(contrast(series[index], series[index - 1]), `${theme} ${index}`).toBeGreaterThanOrEqual(1.6);

      for (const fill of series) expect(contrast(fill, cards[theme])).toBeGreaterThanOrEqual(2);
    }
  });

  it("gives the largest value the strongest shade and steps toward the softest", () => {
    const shades = getChartRankShades(ChartColor.primary1, [10, 40, 20, 30]);
    expect(shades[1]).toBe("var(--chart-primary-rank-0)");
    expect(new Set(shades).size).toBe(4);
    expect(getChartRankShades(ChartColor.secondary2, [1])).toEqual(["var(--chart-secondary-rank-0)"]);
    expect(getChartRankShades("unknown1" as ChartColor, [1])).toEqual(["var(--chart-primary-rank-0)"]);
  });

  it("give doughnut groups a matched set of distinct steps around the chosen colour, largest first", () => {
    expect(getChartMatchedColors(ChartColor.primary1, [3, 9, 1, 5])).toEqual([
      "var(--chart-violet-1)",
      "var(--chart-primary-1)",
      "var(--chart-secondary-1)",
      "var(--chart-info-1)",
    ]);
    expect(getChartMatchedColors(ChartColor.violet1, [6, 5, 4, 3, 2, 1], [false, false, true])).toEqual([
      "var(--chart-violet-1)",
      "var(--chart-secondary-1)",
      "var(--chart-default-rank-3)",
      "var(--chart-primary-1)",
      "var(--chart-info-1)",
      "var(--chart-violet-2)",
    ]);
    for (const color of COLORS) {
      const fills = getChartMatchedColors(color, [4, 3, 2, 1]);
      expect(new Set(fills).size).toBe(4);
      for (const fill of fills) for (const theme of THEME_NAMES) expect(resolve(fill, theme)).toMatch(/^#/);
    }
  });

  it("map every option colour to a chart colour: semantic chips keep their hue, the others join the neutral ramp", () => {
    expect(CHIP_COLORS.map(chipChartColor)).toEqual([
      ChartColor.primary1,
      ChartColor.default1,
      ChartColor.danger1,
      ChartColor.success1,
      ChartColor.warning1,
      ChartColor.secondary1,
    ]);
    for (const theme of THEME_NAMES) {
      expect(resolve(getChartColors()[chipChartColor("default")], theme)).toBe(
        resolve("var(--chart-primary-1)", theme),
      );
      expect(resolve(getChartColors()[chipChartColor("success")], theme)).toBe(
        resolve("var(--chart-success-1)", theme),
      );
    }
  });

  it("keep the label colour of each hue readable on its tint in both themes", () => {
    for (const theme of THEME_NAMES) {
      for (const color of COLORS) {
        const tint = resolve(getChartTintColors()[color], theme);
        expect(tint).toBe(RAMPS[color.replace(/\d$/, "")][theme][2]);
        expect(contrast(tint, resolve(getChartTextColors()[color], theme))).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keep the shared chart tokens on the strongest step of each hue", () => {
    for (const theme of THEME_NAMES) {
      expect([1, 2, 3, 4, 5].map((index) => resolve(`var(--chart-${index})`, theme))).toEqual(
        ["primary", "secondary", "success", "warning", "danger"].map((hue) => RAMPS[hue][theme][0]),
      );
    }
  });
});
