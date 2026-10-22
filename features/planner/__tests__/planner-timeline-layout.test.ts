import { describe, expect, it } from "vitest";

import { layoutPlannerTimeline, timelineLabelWidth, timelineSpan } from "../planner-timeline-layout";

type Item = { id: string; start: string; end: string; label: string };

const layout = (items: Item[], dayWidth = 36) =>
  layoutPlannerTimeline(items, {
    entry: (item) => item,
    label: (item) => item.label,
    from: "2026-10-05",
    to: "2026-10-25",
    dayWidth,
  });

describe("planner timeline layout", () => {
  it("clips spans to the window and marks the ends that continue outside it", () => {
    expect(timelineSpan({ start: "2026-10-01", end: "2026-10-07" }, "2026-10-05", "2026-10-25")).toEqual({
      start: "2026-10-05",
      end: "2026-10-07",
      offset: 0,
      span: 3,
      continuesBefore: true,
      continuesAfter: false,
    });
    expect(timelineSpan({ start: "2026-11-01", end: "2026-11-02" }, "2026-10-05", "2026-10-25")).toBeNull();
  });

  it("shares a row between entries that do not overlap, counting a label beside a short bar", () => {
    const { bars, lanes } = layout([
      { id: "long", start: "2026-10-05", end: "2026-10-09", label: "Kickoff" },
      { id: "after", start: "2026-10-12", end: "2026-10-12", label: "Review" },
      { id: "overlap", start: "2026-10-08", end: "2026-10-10", label: "Workshop" },
      { id: "beside", start: "2026-10-13", end: "2026-10-13", label: "Follow up after the review" },
    ]);
    expect(bars.map(({ item, lane, labelInside }) => [item.id, lane, labelInside])).toEqual([
      ["long", 0, true],
      ["after", 0, false],
      ["overlap", 1, true],
      ["beside", 1, false],
    ]);
    expect(lanes).toBe(2);
  });

  it("puts the label inside a bar only when it fits at the current day width", () => {
    const item = { id: "a", start: "2026-10-05", end: "2026-10-06", label: "Quarterly review" };
    expect(timelineLabelWidth(item.label)).toBe(104);
    expect(layout([item], 36).bars[0].labelInside).toBe(false);
    expect(layout([item], 64).bars[0].labelInside).toBe(true);
  });
});
