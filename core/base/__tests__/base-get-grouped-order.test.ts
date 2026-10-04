import { StubRepo } from "./fixtures/base-get-grouped-order-stub-repo";
import { GroupingInteractor } from "./fixtures/base-get-grouped-order-grouping-interactor";

import { describe, expect, it } from "vitest";

const COLUMN_ID = "11111111-1111-4111-8111-111111111111";

describe("the group axis follows the stored option index, not the stored array order", () => {
  it("orders the group keys by option index", async () => {
    const result = await new GroupingInteractor(new StubRepo()).invoke({
      groupedPagination: { groupingColumnId: COLUMN_ID, perGroup: 10 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.data.groupCounts ?? {})).toEqual(["new", "qualified", "won", "__empty__"]);
  });

  it("transmits that order as the array order of the resolved groups", async () => {
    const result = await new GroupingInteractor(new StubRepo()).invoke({
      groupedPagination: { groupingColumnId: COLUMN_ID, perGroup: 10 },
    });

    if (!result.ok) return;
    expect(result.data.grouping?.groups.map((group) => group.key)).toEqual(["new", "qualified", "won", "__empty__"]);
  });
});
