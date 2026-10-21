import { describe, expect, it } from "vitest";
import { visibleChipRows } from "../chip-stack-rows";

describe("three-row chip previews", () => {
  it("uses the available width on all three rows and reserves room for the count", () => {
    expect(visibleChipRows([180, 90, 90, 180, 90, 90, 180], 280, 3, 4, () => 64)).toBe(6);
  });
  it("keeps long names within narrow fields and the count on the third row", () => {
    expect(visibleChipRows([600, 600, 600, 600], 240, 3, 4, () => 64)).toBe(2);
  });
  it("does not reserve a count when every item fits", () => {
    expect(visibleChipRows([280, 280, 280], 280, 3, 4, () => 64)).toBe(3);
  });
  it("includes records that have not been fetched in the overflow count", () => {
    const seen: number[] = [];
    expect(
      visibleChipRows(
        [180, 180, 180],
        240,
        3,
        4,
        (count) => {
          seen.push(count);
          return 64;
        },
        97,
      ),
    ).toBe(2);
    expect(seen).toEqual([97, 98]);
  });
  it("reveals more chips as the field grows and retains a narrow first row", () => {
    const widths = [180, 180, 180, 180, 180, 180];
    expect(visibleChipRows(widths, 190, 3, 4, () => 64)).toBe(2);
    expect(visibleChipRows(widths, 400, 3, 4, () => 64)).toBe(6);
  });
});
