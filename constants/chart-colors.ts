import type { ChartColor } from "@/features/widget/widget.types";

import { herouiConfig } from "@/styles/heroui.config";

type ColorShades = {
  [key: number]: string;
};

type ThemeColors = {
  default: ColorShades;
  primary: ColorShades;
  secondary: ColorShades;
  success: ColorShades;
  warning: ColorShades;
  danger: ColorShades;
};

const lightColors = herouiConfig.themes?.light?.colors as ThemeColors;
const darkColors = herouiConfig.themes?.dark?.colors as ThemeColors;

type ChartColorSet = {
  fill: string;
  text: string;
  stroke: string;
};

type ChartColorTheme = {
  light: ChartColorSet;
  dark: ChartColorSet;
};

function hexToRgba(hex: string, opacity: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;

  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

type ColorSetConfig = {
  fillLight: string;
  fillDark: string;
  opacity: number;
  lightText: string;
  darkText: string;
  lightStroke: string;
  darkStroke: string;
};

function createColorSet(config: ColorSetConfig): ChartColorTheme {
  const lightFillWithOpacity = hexToRgba(config.fillLight, config.opacity);
  const darkFillWithOpacity = hexToRgba(config.fillDark, config.opacity);
  return {
    light: { fill: lightFillWithOpacity, text: config.lightText, stroke: config.lightStroke },
    dark: { fill: darkFillWithOpacity, text: config.darkText, stroke: config.darkStroke },
  };
}

export const CHART_COLORS: Record<ChartColor, ChartColorTheme> = {
  default1: createColorSet({
    fillLight: lightColors.default[400],
    fillDark: darkColors.default[400],
    opacity: 0.25,
    lightText: lightColors.default[700],
    darkText: darkColors.default[700],
    lightStroke: lightColors.default[300],
    darkStroke: darkColors.default[300],
  }),
  default2: createColorSet({
    fillLight: lightColors.default[500],
    fillDark: darkColors.default[500],
    opacity: 0.25,
    lightText: lightColors.default[700],
    darkText: darkColors.default[700],
    lightStroke: lightColors.default[400],
    darkStroke: darkColors.default[400],
  }),
  primary1: createColorSet({
    fillLight: lightColors.primary[400],
    fillDark: darkColors.primary[400],
    opacity: 0.3,
    lightText: lightColors.primary[600],
    darkText: darkColors.primary[600],
    lightStroke: lightColors.primary[300],
    darkStroke: darkColors.primary[300],
  }),
  primary2: createColorSet({
    fillLight: lightColors.primary[500],
    fillDark: darkColors.primary[500],
    opacity: 0.3,
    lightText: lightColors.primary[600],
    darkText: darkColors.primary[600],
    lightStroke: lightColors.primary[400],
    darkStroke: darkColors.primary[400],
  }),
  secondary1: createColorSet({
    fillLight: lightColors.secondary[400],
    fillDark: darkColors.secondary[400],
    opacity: 0.3,
    lightText: lightColors.secondary[600],
    darkText: darkColors.secondary[600],
    lightStroke: lightColors.secondary[300],
    darkStroke: darkColors.secondary[300],
  }),
  secondary2: createColorSet({
    fillLight: lightColors.secondary[500],
    fillDark: darkColors.secondary[500],
    opacity: 0.3,
    lightText: lightColors.secondary[600],
    darkText: darkColors.secondary[600],
    lightStroke: lightColors.secondary[400],
    darkStroke: darkColors.secondary[400],
  }),
  success1: createColorSet({
    fillLight: lightColors.success[400],
    fillDark: darkColors.success[400],
    opacity: 0.3,
    lightText: lightColors.success[700],
    darkText: darkColors.success[500],
    lightStroke: lightColors.success[300],
    darkStroke: darkColors.success[300],
  }),
  success2: createColorSet({
    fillLight: lightColors.success[500],
    fillDark: darkColors.success[500],
    opacity: 0.3,
    lightText: lightColors.success[700],
    darkText: darkColors.success[500],
    lightStroke: lightColors.success[400],
    darkStroke: darkColors.success[400],
  }),
  warning1: createColorSet({
    fillLight: lightColors.warning[400],
    fillDark: darkColors.warning[400],
    opacity: 0.3,
    lightText: lightColors.warning[700],
    darkText: darkColors.warning[500],
    lightStroke: lightColors.warning[300],
    darkStroke: darkColors.warning[300],
  }),
  warning2: createColorSet({
    fillLight: lightColors.warning[500],
    fillDark: darkColors.warning[500],
    opacity: 0.3,
    lightText: lightColors.warning[700],
    darkText: darkColors.warning[500],
    lightStroke: lightColors.warning[400],
    darkStroke: darkColors.warning[400],
  }),
  danger1: createColorSet({
    fillLight: lightColors.danger[400],
    fillDark: darkColors.danger[400],
    opacity: 0.3,
    lightText: lightColors.danger[600],
    darkText: darkColors.danger[500],
    lightStroke: lightColors.danger[300],
    darkStroke: darkColors.danger[300],
  }),
  danger2: createColorSet({
    fillLight: lightColors.danger[500],
    fillDark: darkColors.danger[500],
    opacity: 0.3,
    lightText: lightColors.danger[600],
    darkText: darkColors.danger[500],
    lightStroke: lightColors.danger[400],
    darkStroke: darkColors.danger[400],
  }),
};

export function getChartColors(theme: string | undefined): Record<ChartColor, string> {
  const selectedTheme = theme === "dark" ? "dark" : "light";
  return Object.entries(CHART_COLORS).reduce(
    (acc, [key, value]) => {
      acc[key as ChartColor] = value[selectedTheme].fill;
      return acc;
    },
    {} as Record<ChartColor, string>,
  );
}

export function getChartTextColors(theme: string | undefined): Record<ChartColor, string> {
  const selectedTheme = theme === "dark" ? "dark" : "light";
  return Object.entries(CHART_COLORS).reduce(
    (acc, [key, value]) => {
      acc[key as ChartColor] = value[selectedTheme].text;
      return acc;
    },
    {} as Record<ChartColor, string>,
  );
}

export function getChartStrokeColors(theme: string | undefined): Record<ChartColor, string> {
  const selectedTheme = theme === "dark" ? "dark" : "light";
  return Object.entries(CHART_COLORS).reduce(
    (acc, [key, value]) => {
      acc[key as ChartColor] = value[selectedTheme].stroke;
      return acc;
    },
    {} as Record<ChartColor, string>,
  );
}
