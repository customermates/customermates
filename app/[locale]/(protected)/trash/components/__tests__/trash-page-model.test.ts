import { describe, expect, it } from "vitest";

import { FilterOperatorKey } from "@/core/base/base-query-builder";

import { TRASH_FILTER, TRASH_PAGE_SIZE, toTrashQuery, trashKindLabelKey } from "../trash-page-model";

describe("toTrashQuery", () => {
  it("reads the first page of everything by default", () => {
    expect(toTrashQuery()).toEqual({ page: 1, pageSize: TRASH_PAGE_SIZE });
  });

  it("maps the kind and list filters, the search term and the page", () => {
    expect(
      toTrashQuery({
        filters: [
          { field: TRASH_FILTER.kind, operator: FilterOperatorKey.in, value: ["record", "view"] },
          { field: TRASH_FILTER.list, operator: FilterOperatorKey.in, value: ["type-1", "type-2"] },
        ],
        searchTerm: "  acme ",
        sortDescriptor: { field: "deletedAt", direction: "asc" },
        pagination: { page: 3, pageSize: 100 },
      }),
    ).toEqual({
      kinds: ["record", "view"],
      typeIds: ["type-1", "type-2"],
      search: "acme",
      sortDescriptor: { field: "deletedAt", direction: "asc" },
      page: 3,
      pageSize: 100,
    });
  });

  it("ignores unknown kinds, empty filters, other operators and a blank search", () => {
    expect(
      toTrashQuery({
        filters: [
          { field: TRASH_FILTER.kind, operator: FilterOperatorKey.in, value: ["member", "apiKey"] },
          { field: TRASH_FILTER.list, operator: FilterOperatorKey.in, value: [] },
          { field: TRASH_FILTER.list, operator: FilterOperatorKey.notIn, value: ["type-1"] },
        ],
        searchTerm: "   ",
        sortDescriptor: { field: "name", direction: "asc" },
      }),
    ).toEqual({ page: 1, pageSize: TRASH_PAGE_SIZE });
  });
});

describe("trashKindLabelKey", () => {
  it("names a view of the dashboard a dashboard view", () => {
    expect(trashKindLabelKey({ kind: "view", surfaceKey: "dashboard" })).toBe("dashboardView");
    expect(trashKindLabelKey({ kind: "view", surfaceKey: "records:type-1" })).toBe("view");
    expect(trashKindLabelKey({ kind: "record", surfaceKey: null })).toBe("record");
  });
});
