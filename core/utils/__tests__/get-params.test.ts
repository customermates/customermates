import type { Filter } from "@/core/base/base-get.schema";

import { describe, expect, it } from "vitest";

import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { decodeGetParams, encodeGetParams } from "@/core/utils/get-params";

describe("filter URL parameters", () => {
  it("round trips relation existence filters without a value token", () => {
    const filters: Filter[] = [
      { field: FilterFieldKey.userIds, operator: FilterOperatorKey.hasNone },
      { field: FilterFieldKey.contactIds, operator: FilterOperatorKey.hasSome },
    ];

    const encoded = encodeGetParams({ filters });

    expect(encoded.getAll("filters")).toEqual(["userIds:hasNone", "contactIds:hasSome"]);
    expect(decodeGetParams(encoded).filters).toEqual(filters);
  });

  it("preserves legacy value-taking tokens as membership filters", () => {
    const encoded = new URLSearchParams();
    encoded.append("filters", "userIds:hasNone:u1,u2");
    encoded.append("filters", "contactIds:hasSome:c1");

    expect(decodeGetParams(encoded).filters).toEqual([
      { field: FilterFieldKey.userIds, operator: FilterOperatorKey.notIn, value: ["u1", "u2"] },
      { field: FilterFieldKey.contactIds, operator: FilterOperatorKey.in, value: ["c1"] },
    ]);
  });

  it("round trips filters alongside the view, view mode and grouping parameters", () => {
    const viewId = "3a7b2c11-5d4e-4f60-8a91-2b3c4d5e6f70";
    const groupingColumnId = "8f1c1a4e-0b2d-4a9e-9d7c-1f2a3b4c5d6e";
    const filters: Filter[] = [{ field: "name", operator: FilterOperatorKey.contains, value: "acme" }];

    const encoded = encodeGetParams({
      filters,
      viewId,
      viewMode: ViewMode.card,
      grouping: { field: groupingColumnId },
      page: 2,
    });

    expect(decodeGetParams(encoded)).toEqual({
      filters,
      searchTerm: undefined,
      sortDescriptor: undefined,
      page: 2,
      pageSize: undefined,
      viewId,
      viewMode: ViewMode.card,
      grouping: { field: groupingColumnId },
    });
  });

  it("ignores the retired sortField, sortDir and json filters parameters", () => {
    const legacy = new URLSearchParams();
    legacy.set("sortField", "name");
    legacy.set("sortDir", "asc");
    legacy.set("filters", JSON.stringify([{ f: "name", o: FilterOperatorKey.contains, v: "acme" }]));

    const decoded = decodeGetParams(legacy);

    expect(decoded.sortDescriptor).toBeUndefined();
    expect(decoded.filters).toEqual([]);
  });

  it("normalizes legacy filter objects before encoding", () => {
    const filters = [
      { field: FilterFieldKey.userIds, operator: FilterOperatorKey.hasNone, value: ["u1"] },
      { field: FilterFieldKey.contactIds, operator: FilterOperatorKey.hasSome, value: ["c1"] },
    ] as unknown as Filter[];

    expect(encodeGetParams({ filters }).getAll("filters")).toEqual(["userIds:notIn:u1", "contactIds:in:c1"]);
  });
});
