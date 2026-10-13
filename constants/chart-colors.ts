import type { ChartColor } from "@/features/widget/widget.schema";

type ChartColorSet = { fill: string; text: string; stroke: string };
type ChartColorTheme = { light: ChartColorSet; dark: ChartColorSet };
type Hue = "default" | "primary" | "secondary" | "success" | "warning" | "danger";
type Ramp = { light: [string, string, string]; dark: [string, string, string]; text: { light: string; dark: string } };

const RAMPS: Record<Hue, Ramp> = {
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

const CHART_COLORS = Object.fromEntries(
  (Object.entries(RAMPS) as Array<[Hue, Ramp]>).flatMap(([hue, ramp]) =>
    [0, 1, 2].map((step) => [
      `${hue}${step + 1}`,
      {
        light: { fill: ramp.light[step], stroke: ramp.light[step], text: ramp.text.light },
        dark: { fill: ramp.dark[step], stroke: ramp.dark[step], text: ramp.text.dark },
      },
    ]),
  ),
) as Record<ChartColor, ChartColorTheme>;

function pick(theme: string | undefined, field: keyof ChartColorSet): Record<ChartColor, string> {
  const selected = theme === "dark" ? "dark" : "light";
  return Object.fromEntries(
    Object.entries(CHART_COLORS).map(([key, value]) => [key, value[selected][field]]),
  ) as Record<ChartColor, string>;
}

export function getChartColors(theme: string | undefined) {
  return pick(theme, "fill");
}

export function getChartTextColors(theme: string | undefined) {
  return pick(theme, "text");
}

export function getChartStrokeColors(theme: string | undefined) {
  return pick(theme, "stroke");
}

const SHADE_STEPS = 7;
const SHADE_REACH = 0.75;

function mixHex(from: string, to: string, amount: number) {
  const channel = (hex: string, offset: number) => parseInt(hex.slice(offset, offset + 2), 16);
  return `#${[1, 3, 5]
    .map((offset) =>
      Math.round(channel(from, offset) + (channel(to, offset) - channel(from, offset)) * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export function getChartRankShades(color: ChartColor, theme: string | undefined, values: number[]): string[] {
  const hue = color.replace(/\d$/, "") as Hue;
  const ramp = (RAMPS[hue] ?? RAMPS.primary)[theme === "dark" ? "dark" : "light"];
  const order = values.map((value, index) => ({ value, index })).sort((left, right) => right.value - left.value);
  const ranks = new Map(order.map(({ index }, rank) => [index, rank]));
  const span = Math.min(SHADE_STEPS - 1, (values.length - 1) * 2);
  return values.map((_, index) => {
    const rank = ranks.get(index) ?? 0;
    const step = values.length > 1 ? Math.round((rank / (values.length - 1)) * span) : 0;
    return mixHex(ramp[0], ramp[2], (step / (SHADE_STEPS - 1)) * SHADE_REACH);
  });
}
