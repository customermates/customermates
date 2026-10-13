import type { ChartColor } from "@/features/widget/widget.schema";

type Hue = "default" | "primary" | "secondary" | "success" | "warning" | "danger";

const HUES: Hue[] = ["default", "primary", "secondary", "success", "warning", "danger"];
const STEPS = [1, 2, 3];

function byColor(token: (hue: Hue, step: number) => string) {
  return Object.fromEntries(HUES.flatMap((hue) => STEPS.map((step) => [`${hue}${step}`, token(hue, step)]))) as Record<
    ChartColor,
    string
  >;
}

const FILL_COLORS = byColor((hue, step) => `var(--chart-${hue}-${step})`);
const TEXT_COLORS = byColor((hue) => `var(--chart-${hue}-text)`);

export function getChartColors() {
  return FILL_COLORS;
}

export function getChartTextColors() {
  return TEXT_COLORS;
}

export function getChartStrokeColors() {
  return FILL_COLORS;
}

const SHADE_STEPS = 7;

export function getChartRankShades(color: ChartColor, values: number[]): string[] {
  const named = color.replace(/\d$/, "") as Hue;
  const hue = HUES.includes(named) ? named : "primary";
  const order = values.map((value, index) => ({ value, index })).sort((left, right) => right.value - left.value);
  const ranks = new Map(order.map(({ index }, rank) => [index, rank]));
  const span = Math.min(SHADE_STEPS - 1, (values.length - 1) * 2);
  return values.map((_, index) => {
    const rank = ranks.get(index) ?? 0;
    const step = values.length > 1 ? Math.round((rank / (values.length - 1)) * span) : 0;
    return `var(--chart-${hue}-rank-${step})`;
  });
}
