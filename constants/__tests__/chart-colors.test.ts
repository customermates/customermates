import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { getChartColors, getChartRankShades, getChartStrokeColors, getChartTextColors } from "@/constants/chart-colors";
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

function previousMix(from: string, to: string, amount: number) {
  const channel = (hex: string, offset: number) => parseInt(hex.slice(offset, offset + 2), 16);
  return `#${[1, 3, 5]
    .map((offset) =>
      Math.round(channel(from, offset) + (channel(to, offset) - channel(from, offset)) * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function previousRankShades(color: ChartColor, theme: Theme, values: number[]) {
  const ramp = (PREVIOUS_RAMPS[color.replace(/\d$/, "")] ?? PREVIOUS_RAMPS.primary)[theme];
  const order = values.map((value, index) => ({ value, index })).sort((left, right) => right.value - left.value);
  const ranks = new Map(order.map(({ index }, rank) => [index, rank]));
  const span = Math.min(6, (values.length - 1) * 2);
  return values.map((_, index) => {
    const step = values.length > 1 ? Math.round(((ranks.get(index) ?? 0) / (values.length - 1)) * span) : 0;
    return previousMix(ramp[0], ramp[2], (step / 6) * 0.75);
  });
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

  it("resolve rank shades to the previous mix for every hue, count and tie", () => {
    const series = [[1], [5, 3], [3, 5], [10, 40, 20, 30], [2, 2, 1], [7, 7, 7, 7], [9, 1, 8, 2, 7, 3, 6, 4, 5], []];
    for (const theme of THEME_NAMES) {
      for (const color of COLORS) {
        for (const values of series) {
          expect(getChartRankShades(color, values).map((shade) => resolve(shade, theme))).toEqual(
            previousRankShades(color, theme, values),
          );
        }
      }
    }
  });

  it("gives the largest value the strongest shade and steps toward the softest", () => {
    const shades = getChartRankShades(ChartColor.primary1, [10, 40, 20, 30]);
    expect(shades[1]).toBe("var(--chart-primary-rank-0)");
    expect(new Set(shades).size).toBe(4);
    expect(getChartRankShades(ChartColor.secondary2, [1])).toEqual(["var(--chart-secondary-rank-0)"]);
    expect(getChartRankShades("unknown1" as ChartColor, [1])).toEqual(["var(--chart-primary-rank-0)"]);
  });

  it("keep the shared chart tokens on the strongest step of each hue", () => {
    for (const theme of THEME_NAMES) {
      expect([1, 2, 3, 4, 5].map((index) => resolve(`var(--chart-${index})`, theme))).toEqual(
        ["primary", "secondary", "success", "warning", "danger"].map((hue) => PREVIOUS_RAMPS[hue][theme][0]),
      );
    }
  });
});
