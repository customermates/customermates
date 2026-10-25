import type { ChipColor } from "@/constants/chip-colors";
import type { ChartColor } from "@/features/widget/widget.schema";

type Hue = "default" | "primary" | "info" | "violet" | "secondary" | "success" | "warning" | "danger";

const HUES: Hue[] = ["default", "primary", "info", "violet", "secondary", "success", "warning", "danger"];
const STEPS = [1, 2, 3];

function byColor(token: (hue: Hue, step: number) => string) {
  return Object.fromEntries(HUES.flatMap((hue) => STEPS.map((step) => [`${hue}${step}`, token(hue, step)]))) as Record<
    ChartColor,
    string
  >;
}

const FILL_COLORS = byColor((hue, step) => `var(--chart-${hue}-${step})`);
const TEXT_COLORS = byColor((hue) => `var(--chart-${hue}-text)`);
const TINT_COLORS = byColor((hue) => `var(--chart-${hue}-3)`);

export function getChartColors() {
  return FILL_COLORS;
}

export function getChartTextColors() {
  return TEXT_COLORS;
}

export function getChartTintColors() {
  return TINT_COLORS;
}

export function getChartStrokeColors() {
  return FILL_COLORS;
}

const CHIP_HUES: Record<ChipColor, Hue> = {
  default: "primary",
  secondary: "default",
  destructive: "danger",
  success: "success",
  warning: "warning",
  info: "secondary",
};

export function chipChartColor(color: ChipColor): ChartColor {
  return `${CHIP_HUES[color]}1` as ChartColor;
}

const SHADE_STEPS = 7;

export const CHART_NEUTRAL_SHADE = "var(--chart-default-rank-3)";

export function getChartRankShades(color: ChartColor, values: number[], neutral: boolean[] = []): string[] {
  const named = color.replace(/\d$/, "") as Hue;
  const hue = HUES.includes(named) ? named : "primary";
  const ranked = values.flatMap((value, index) => (neutral[index] ? [] : [{ value, index }]));
  const order = [...ranked].sort((left, right) => right.value - left.value);
  const ranks = new Map(order.map(({ index }, rank) => [index, rank]));
  const span = Math.min(SHADE_STEPS - 1, (ranked.length - 1) * 2);
  return values.map((_, index) => {
    if (neutral[index]) return CHART_NEUTRAL_SHADE;
    const rank = ranks.get(index) ?? 0;
    const step = ranked.length > 1 ? Math.round((rank / (ranked.length - 1)) * span) : 0;
    return `var(--chart-${hue}-rank-${step})`;
  });
}

const MATCHED_HUES: Record<Hue, Hue[]> = {
  primary: ["primary", "info", "secondary", "default"],
  info: ["info", "secondary", "violet", "default"],
  violet: ["violet", "info", "secondary", "default"],
  secondary: ["secondary", "info", "primary", "default"],
  success: ["success", "info", "primary", "default"],
  warning: ["warning", "danger", "primary", "default"],
  danger: ["danger", "warning", "primary", "default"],
  default: ["default", "primary", "info", "secondary"],
};

export function getChartMatchedColors(color: ChartColor, values: number[], neutral: boolean[] = []): string[] {
  const named = color.replace(/\d$/, "") as Hue;
  const hues = MATCHED_HUES[HUES.includes(named) ? named : "primary"];
  const ranked = values.flatMap((value, index) => (neutral[index] ? [] : [{ value, index }]));
  const order = [...ranked].sort((left, right) => right.value - left.value);
  const ranks = new Map(order.map(({ index }, rank) => [index, rank]));
  return values.map((_, index) => {
    if (neutral[index]) return CHART_NEUTRAL_SHADE;
    const rank = ranks.get(index) ?? 0;
    const step = Math.min(STEPS.length, Math.floor(rank / hues.length) + 1);
    return `var(--chart-${hues[rank % hues.length]}-${step})`;
  });
}
