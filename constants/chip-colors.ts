import type { ChipProps } from "@heroui/chip";

export const CHIP_COLORS = ["default", "primary", "secondary", "success", "warning", "danger"] as const satisfies Array<
  ChipProps["color"]
>;

export type ChipColor = (typeof CHIP_COLORS)[number];
