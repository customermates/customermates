import type { ChartColor } from "@/features/widget/widget.types";

import { colorPalettes } from "@/styles/color-palettes";

type ColorShades = { [key: number]: string };
type ThemeColors = {
  default: ColorShades;
  primary: ColorShades;
  secondary: ColorShades;
  success: ColorShades;
  warning: ColorShades;
  danger: ColorShades;
};
type Hue = keyof ThemeColors;

type ChartColorSet = { fill: string; text: string; stroke: string };
type ChartColorTheme = { light: ChartColorSet; dark: ChartColorSet };

const darkColors = colorPalettes.dark as unknown as ThemeColors;

const HUES: Hue[] = ["default", "primary", "secondary", "success", "warning", "danger"];
const FILL_SHADES = [400, 500, 600] as const;
const HIGH_CONTRAST_TEXT_SHADE = 900;

function buildColorSet(hue: Hue, fillShade: number): ChartColorTheme {
  const textShade = HIGH_CONTRAST_TEXT_SHADE;
  const set = {
    fill: darkColors[hue][fillShade],
    text: darkColors[hue][textShade],
    stroke: darkColors[hue][fillShade],
  };
  return { light: set, dark: set };
}

export const CHART_COLORS = HUES.reduce(
  (acc, hue) => {
    FILL_SHADES.forEach((shade, i) => {
      const key = `${hue}${i + 1}` as ChartColor;
      acc[key] = buildColorSet(hue, shade);
    });
    return acc;
  },
  {} as Record<ChartColor, ChartColorTheme>,
);

function pick(theme: string | undefined, field: keyof ChartColorSet): Record<ChartColor, string> {
  const selected = theme === "dark" ? "dark" : "light";
  return Object.entries(CHART_COLORS).reduce(
    (acc, [key, value]) => {
      acc[key as ChartColor] = value[selected][field];
      return acc;
    },
    {} as Record<ChartColor, string>,
  );
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
