import { describe, expect, it } from "vitest";

import { getChartColors, getChartRankShades } from "@/constants/chart-colors";
import { ChartColor } from "@/features/widget/widget.schema";

describe("getChartRankShades", () => {
  it("gives the largest value the strongest shade and steps toward the softest", () => {
    const shades = getChartRankShades(ChartColor.primary1, "light", [10, 40, 20, 30]);
    expect(shades[1]).toBe(getChartColors("light")[ChartColor.primary1]);
    expect(shades[0]).not.toBe(getChartColors("light")[ChartColor.primary3]);
    expect(shades[0]).not.toBe(getChartColors("light")[ChartColor.primary2]);
    expect(new Set(shades).size).toBe(4);
  });

  it("keeps a few categories on neighbouring steps in both themes", () => {
    for (const theme of ["light", "dark"]) {
      const [strong, soft] = getChartRankShades(ChartColor.danger1, theme, [5, 3]);
      expect(strong).toBe(getChartColors(theme)[ChartColor.danger1]);
      expect(soft).not.toBe(getChartColors(theme)[ChartColor.danger3]);
      expect(soft).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("returns one shade for a single value", () => {
    expect(getChartRankShades(ChartColor.secondary2, "dark", [1])).toEqual([
      getChartColors("dark")[ChartColor.secondary1],
    ]);
  });
});
