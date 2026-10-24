import { describe, expect, it } from "vitest";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { linkedRecordsFilter } from "../linked-records-link";

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
});
