import { describe, expect, it } from "vitest";

import {
  getEntityDetailSummaryGeometry,
  getSummaryCellGridColumn,
  getSummarySeparatorColumns,
  isSummaryGroupStart,
} from "../entity-detail-summary-geometry";

describe("entity detail summary geometry", () => {
  it.each([
    [false, false, "details", [], []],
    [true, false, "details-notes", [6, 3], [7]],
    [false, true, "details-activities", [6, 3], [7]],
    [true, true, "details-notes-activities", [4, 3, 3], [5, 9]],
  ] as const)(
    "matches notes=%s activities=%s to the %s panel boundaries",
    (showNotesPanel, showActivityPanel, id, groupSizes, dividerColumns) => {
      const geometry = getEntityDetailSummaryGeometry({
        showActivityPanel,
        showNotesPanel,
      });

      expect(geometry.id).toBe(id);
      expect(geometry.groupSizes).toEqual(groupSizes);
      expect(getSummarySeparatorColumns(geometry.groupSizes)).toEqual(dividerColumns);
      expect(Boolean(geometry.gridTemplateColumns)).toBe(groupSizes.length > 0);
    },
  );

  it("places the aligned favorite capacity around the wide panel-divider tracks", () => {
    const groupSizes = [4, 3, 3];

    expect(Array.from({ length: 10 }, (_, index) => getSummaryCellGridColumn(index, groupSizes))).toEqual([
      1, 2, 3, 4, 6, 7, 8, 10, 11, 12,
    ]);
    expect(Array.from({ length: 10 }, (_, index) => isSummaryGroupStart(index, groupSizes))).toEqual([
      false,
      false,
      false,
      false,
      true,
      false,
      false,
      true,
      false,
      false,
    ]);
  });
});
