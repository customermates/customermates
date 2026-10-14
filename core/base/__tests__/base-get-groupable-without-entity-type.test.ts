import { OperatorLikeRepo } from "./fixtures/base-get-groupable-without-entity-type-operator-like-repo";
import { OperatorLikeInteractor } from "./fixtures/base-get-groupable-without-entity-type-operator-like-interactor";

import { describe, expect, it } from "vitest";

describe("a repository without an entity type but with groupable specs", () => {
  it("advertises its groupable fields on a flat request so the display options can offer Board", async () => {
    const result = await new OperatorLikeInteractor(new OperatorLikeRepo()).invoke({});

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.groupableFields).toEqual([
      {
        id: "status",
        grouping: { field: "status" },
        kind: "enum",
        labelKey: "Common.table.columns.status",
        supportsDragWriteBack: false,
      },
    ]);
    expect(result.data.grouping).toBeUndefined();
  });

  it("resolves a grouped request against those specs and fetches rows only for non-empty groups", async () => {
    const repo = new OperatorLikeRepo();
    const result = await new OperatorLikeInteractor(repo).invoke({ grouping: { field: "status" } });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.grouping?.groups.map(({ key, count, itemIds }) => [key, count, itemIds])).toEqual([
      ["active", 2, ["u1", "u2"]],
      ["inactive", 1, ["u3"]],
      ["pendingAuthorization", 0, []],
    ]);
    expect(result.data.groupCounts).toEqual({ active: 2, inactive: 1, pendingAuthorization: 0 });
    expect(repo.getItems.mock.calls.map(([params]) => params.groupScope?.key)).toEqual(["active", "inactive"]);
  });
});
