export const CHIP_COLORS = ["default", "secondary", "destructive", "success", "warning", "info"] as const;

export type ChipColor = (typeof CHIP_COLORS)[number];

export function toChipColor(value: string | null | undefined, fallback: ChipColor = "secondary"): ChipColor {
  return CHIP_COLORS.includes(value as ChipColor) ? (value as ChipColor) : fallback;
}
