import { describe, expect, it } from "vitest";

import { decodeGetParams } from "@/core/utils/get-params";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { linkedRecordsFilter, linkedRecordsHref } from "../linked-records-link";

const source = { typeId: "11111111-1111-4111-8111-111111111111", recordId: "22222222-2222-4222-8222-222222222222" };
const relationId = "33333333-3333-4333-8333-333333333333";

describe("linked records link", () => {
  it("filters the target list from the opposite end of the relationship", () => {
    expect(linkedRecordsFilter(source, { relationId, direction: "outgoing" })).toEqual({
      field: `relationship:${relationId}:incoming`,
      operator: FilterOperatorKey.in,
      value: [source.recordId],
    });
    expect(linkedRecordsFilter(source, { relationId, direction: "incoming" }).field).toBe(
      `relationship:${relationId}:outgoing`,
    );
    expect(linkedRecordsFilter(source, { pathId: relationId })).toEqual({
      field: `path:${relationId}`,
      operator: FilterOperatorKey.in,
      value: [source.recordId],
    });
  });

  it("opens the unsaved table view of the target list with the filter in the URL", () => {
    const filter = linkedRecordsFilter(source, { relationId, direction: "incoming" });
    const href = linkedRecordsHref("44444444-4444-4444-8444-444444444444", [filter], "acme");
    const [path, query] = href.split("?");
    expect(path).toBe("/records/44444444-4444-4444-8444-444444444444");
    expect(decodeGetParams(new URLSearchParams(query))).toMatchObject({
      filters: [filter],
      searchTerm: "acme",
      viewId: "__all__",
      viewMode: "table",
    });
  });
});
