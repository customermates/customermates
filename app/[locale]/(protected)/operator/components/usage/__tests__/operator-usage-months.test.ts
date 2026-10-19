import { describe, expect, it } from "vitest";

import { operatorUsageMonths, recentOperatorUsageMonths } from "../operator-usage-months";

describe("operator usage months", () => {
  it("lists every month from the first to now, newest first", () => {
    expect(operatorUsageMonths(new Date("2026-08-20T00:00:00.000Z"), new Date("2026-10-01T00:00:00.000Z"))).toEqual([
      "2026-10",
      "2026-09",
      "2026-08",
    ]);
  });

  it("keeps a selected month outside the range so the picker can show it", () => {
    expect(
      operatorUsageMonths(new Date("2026-09-01T00:00:00.000Z"), new Date("2026-10-05T00:00:00.000Z"), "2025-12"),
    ).toEqual(["2026-10", "2026-09", "2025-12"]);
  });

  it("offers the last 36 months for a workspace", () => {
    const months = recentOperatorUsageMonths(new Date("2026-10-19T00:00:00.000Z"), "2026-09");

    expect(months).toHaveLength(36);
    expect(months[0]).toBe("2026-10");
    expect(months.at(-1)).toBe("2023-11");
  });
});
