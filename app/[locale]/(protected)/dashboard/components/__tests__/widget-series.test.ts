import { describe, expect, it } from "vitest";

import {
  bucketQuarter,
  fillTimeSeries,
  funnelConversions,
  orderFunnelSteps,
  rankByValue,
  shareOfTotal,
  shiftBucketStart,
} from "../widget-series";

describe("widget series helpers", () => {
  it("advances bucket starts by calendar interval across month and year ends", () => {
    expect(shiftBucketStart("2026-12-31", "day")).toBe("2027-01-01");
    expect(shiftBucketStart("2026-12-28", "week")).toBe("2027-01-04");
    expect(shiftBucketStart("2026-01-01", "month")).toBe("2026-02-01");
    expect(shiftBucketStart("2026-10-01", "quarter")).toBe("2027-01-01");
    expect(shiftBucketStart("2026-01-01", "year", 2)).toBe("2028-01-01");
    expect(bucketQuarter("2026-07-01")).toBe(3);
  });

  it("fills empty buckets between the first and last period in chronological order", () => {
    expect(
      fillTimeSeries(
        [
          { start: "2026-04-01", item: "april" },
          { start: "2026-01-01", item: "january" },
        ],
        "month",
      ),
    ).toEqual([
      { start: "2026-01-01", item: "january" },
      { start: "2026-02-01", item: null },
      { start: "2026-03-01", item: null },
      { start: "2026-04-01", item: "april" },
    ]);
    expect(fillTimeSeries([], "day")).toEqual([]);
    expect(
      fillTimeSeries(
        [
          { start: "2026-01-01", item: 1 },
          { start: "2026-01-10", item: 2 },
        ],
        "day",
        5,
      ),
    ).toEqual([
      { start: "2026-01-01", item: 1 },
      { start: "2026-01-10", item: 2 },
    ]);
  });

  it("orders funnel steps by option order and fills skipped steps only between present ones", () => {
    const steps = [
      { optionId: "proposal", item: 2 },
      { optionId: "new", item: 9 },
      { optionId: "removed", item: 1 },
    ];
    const order = ["new", "qualified", "proposal", "won", "lost"];
    expect(orderFunnelSteps(steps, order, true)).toEqual([
      { optionId: "new", item: 9 },
      { optionId: "qualified", item: null },
      { optionId: "proposal", item: 2 },
      { optionId: "removed", item: 1 },
    ]);
    expect(orderFunnelSteps(steps, order, false).map((step) => step.optionId)).toEqual(["new", "proposal", "removed"]);
    expect(funnelConversions([10, 5, 0, 3])).toEqual([null, 0.5, 0, null]);
  });

  it("ranks by value with unavailable values last and computes shares of a positive total", () => {
    const rows = [
      { label: "Beta", value: 5 },
      { label: "Restricted", value: null },
      { label: "Alpha", value: 5 },
      { label: "Gamma", value: 20 },
    ];
    expect(rankByValue(rows, "en").map((row) => row.label)).toEqual(["Gamma", "Alpha", "Beta", "Restricted"]);
    expect(shareOfTotal(5, 20)).toBe(0.25);
    expect(shareOfTotal(5, 0)).toBeNull();
    expect(shareOfTotal(-1, 20)).toBeNull();
    expect(shareOfTotal(null, 20)).toBeNull();
  });
});
