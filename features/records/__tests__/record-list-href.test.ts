import type { Filter } from "@/core/base/base-get.schema";

import { describe, expect, it } from "vitest";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { decodeGetParams } from "@/core/utils/get-params";
import { linkedRecordsFilter } from "../linked-records-link";
import { recordListHref } from "../record-list-href";

const TYPE_ID = "44444444-4444-4444-8444-444444444444";

describe("recordListHref", () => {
  it("opens the unsaved table view of a list with the filters and search in the URL", () => {
    const filter = linkedRecordsFilter(
      { typeId: "11111111-1111-4111-8111-111111111111", recordId: "22222222-2222-4222-8222-222222222222" },
      { relationId: "33333333-3333-4333-8333-333333333333", direction: "incoming" },
    );
    const [path, query] = (recordListHref(TYPE_ID, [filter], { searchTerm: "acme" }) ?? "").split("?");
    expect(path).toBe(`/records/${TYPE_ID}`);
    expect(decodeGetParams(new URLSearchParams(query))).toMatchObject({
      filters: [filter],
      searchTerm: "acme",
      viewId: "__all__",
      viewMode: "table",
    });
  });

  it("leaves out a link that would exceed request limits", () => {
    const long: Filter = { field: "name", operator: FilterOperatorKey.contains, value: "x".repeat(9000) };
    expect(recordListHref(TYPE_ID, [long])).toBeNull();
  });
});
