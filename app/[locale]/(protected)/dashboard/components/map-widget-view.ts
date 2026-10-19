import type { ChipColor } from "@/constants/chip-colors";
import type { RecordDisplayField } from "@/features/records/record-display-field.schema";
import type { CalculatedValue } from "@/features/records/record-model.schema";
import type { MapWidgetPoint } from "@/features/widget/record-map-widget.schema";
import type { MapViewPoint } from "@/components/map/map-types";

import { CHIP_COLORS } from "@/constants/chip-colors";
import { MIXED_CLUSTER_COLOR } from "@/components/map/map-palette";

export const MAP_DEFAULT_COLOR = "var(--chart-1)";
export const MAP_NEUTRAL_COLOR = "var(--chart-default-2)";
export const MAP_MISSING_GROUP = "";
const CHART_PALETTE_SIZE = 5;

const CHIP_COLOR_TOKENS: Record<ChipColor, string> = {
  default: "var(--primary)",
  secondary: "var(--chart-default-1)",
  destructive: "var(--destructive)",
  success: "var(--success)",
  warning: "var(--warning)",
  info: "var(--info)",
};

type ColorField = Pick<RecordDisplayField, "options"> | undefined;

export function mapOptionColor(field: ColorField, optionId: string | null): string {
  if (!field) return MAP_DEFAULT_COLOR;
  const index = optionId === null ? -1 : field.options.findIndex((option) => option.id === optionId);
  if (index < 0) return MAP_NEUTRAL_COLOR;
  const color = field.options[index].color;
  if (color && (CHIP_COLORS as readonly string[]).includes(color)) return CHIP_COLOR_TOKENS[color as ChipColor];
  return `var(--chart-${(index % CHART_PALETTE_SIZE) + 1})`;
}

export function mapPointWeight(size: CalculatedValue | null): number | null {
  if (!size || size.state !== "value" || size.value.kind !== "decimal") return null;
  const value = Number(size.value.value);
  return Number.isFinite(value) ? Math.max(0, value) : null;
}

function knownOption(field: NonNullable<ColorField>, optionId: string | null) {
  return optionId !== null && field.options.some((option) => option.id === optionId);
}

export function mapViewPoints(points: MapWidgetPoint[], colorField: ColorField): MapViewPoint[] {
  return points.map((point) => ({
    id: point.record.recordId,
    lat: point.lat,
    lon: point.lon,
    group: colorField ? (knownOption(colorField, point.color) ? point.color : MAP_MISSING_GROUP) : null,
    color: mapOptionColor(colorField, point.color),
    weight: mapPointWeight(point.size),
  }));
}

export type MapLegendEntry = {
  kind: "option" | "missing" | "mixed";
  id: string | null;
  label: string | null;
  color: string;
  count: number | null;
};

export function mapLegend(points: MapWidgetPoint[], colorField: ColorField): MapLegendEntry[] {
  if (!colorField) return [];
  const counts = new Map<string | null, number>();
  for (const point of points) {
    const key = knownOption(colorField, point.color) ? point.color : null;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const entries: MapLegendEntry[] = colorField.options.flatMap((option) => {
    const count = counts.get(option.id);
    return count
      ? [{ kind: "option", id: option.id, label: option.label, color: mapOptionColor(colorField, option.id), count }]
      : [];
  });
  const missing = counts.get(null);
  if (missing) entries.push({ kind: "missing", id: null, label: null, color: MAP_NEUTRAL_COLOR, count: missing });
  if (entries.length > 1)
    entries.push({ kind: "mixed", id: null, label: null, color: MIXED_CLUSTER_COLOR, count: null });
  return entries;
}
