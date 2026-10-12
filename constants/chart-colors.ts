import type { ChartColor } from "@/features/widget/widget.schema";

type ChartColorSet = { fill: string; text: string; stroke: string };
type ChartColorTheme = { light: ChartColorSet; dark: ChartColorSet };
type Hue = "default" | "primary" | "secondary" | "success" | "warning" | "danger";
type Ramp = { light: [string, string, string]; dark: [string, string, string]; text: { light: string; dark: string } };

/**
 * One restrained chart palette. The brand violet is the accent and leads every chart; teal is its quiet companion,
 * the semantic hues are desaturated so a status split never reads as a rainbow, and the greys carry everything that
 * is context rather than signal. Each hue steps from strong to soft, and the dark ramp steps toward the surface
 * instead of toward white, so the second and third shades recede in both themes.
 */
const RAMPS: Record<Hue, Ramp> = {
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
  default: {
    light: ["#6b6b76", "#a3a3ad", "#d0d0d6"],
    dark: ["#a1a1aa", "#71717a", "#4a4a52"],
    text: { light: "#27272a", dark: "#f4f4f5" },
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
