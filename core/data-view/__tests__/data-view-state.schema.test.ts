import { describe, expect, it } from "vitest";

import { ViewMode } from "@/core/base/base-query-builder";

import { ALL_VIEW_KEY } from "../data-view-keys";
import { DataViewStateSchema, ViewKeySchema } from "../data-view-state.schema";

describe("DataViewStateSchema", () => {
  it("rejects a page key structurally", () => {
    const result = DataViewStateSchema.safeParse({ filters: [], page: 2 });

    expect(result.success).toBe(false);
  });

  it("drops a known key carrying an undefined value so layer precedence stays honest", () => {
    const parsed = DataViewStateSchema.parse({ filters: undefined, searchTerm: "ada" });

    expect(Object.prototype.hasOwnProperty.call(parsed, "filters")).toBe(false);
    expect(parsed).toEqual({ searchTerm: "ada" });
  });

  it("accepts a 200 character search term and rejects a 201 character one", () => {
    expect(DataViewStateSchema.safeParse({ searchTerm: "a".repeat(200) }).success).toBe(true);
    expect(DataViewStateSchema.safeParse({ searchTerm: "a".repeat(201) }).success).toBe(false);
  });

  it("still parses a filter carrying an undefined value key", () => {
    const parsed = DataViewStateSchema.parse({
      filters: [{ field: "firstName", operator: "isNull", value: undefined }],
    });

    expect(parsed.filters).toEqual([{ field: "firstName", operator: "isNull" }]);
  });

  it("accepts every empty cleared value and both nullable fields", () => {
    const parsed = DataViewStateSchema.parse({
      filters: [],
      searchTerm: "",
      sortDescriptor: null,
      grouping: null,
      columnOrder: [],
      columnWidths: {},
      hiddenColumns: [],
      pageSize: 25,
      viewMode: ViewMode.card,
    });

    expect(parsed).toEqual({
      filters: [],
      searchTerm: "",
      sortDescriptor: null,
      grouping: null,
      columnOrder: [],
      columnWidths: {},
      hiddenColumns: [],
      pageSize: 25,
      viewMode: ViewMode.card,
    });
  });

  it("rejects a page size outside the supported set", () => {
    expect(DataViewStateSchema.safeParse({ pageSize: 50 }).success).toBe(false);
  });
});

describe("ViewKeySchema", () => {
  it("accepts the All key and a uuid and nothing else", () => {
    expect(ViewKeySchema.safeParse(ALL_VIEW_KEY).success).toBe(true);
    expect(ViewKeySchema.safeParse("11111111-1111-4111-8111-111111111111").success).toBe(true);
    expect(ViewKeySchema.safeParse("not-a-view-key").success).toBe(false);
  });
});
