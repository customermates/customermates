import type { Filter } from "@/core/base/base-get.schema";

import { describe, expect, it } from "vitest";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
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

  it("normalizes legacy filter objects before encoding", () => {
    const filters = [
      { field: FilterFieldKey.userIds, operator: FilterOperatorKey.hasNone, value: ["u1"] },
      { field: FilterFieldKey.contactIds, operator: FilterOperatorKey.hasSome, value: ["c1"] },
    ] as unknown as Filter[];

    expect(encodeGetParams({ filters }).getAll("filters")).toEqual(["userIds:notIn:u1", "contactIds:in:c1"]);
  });
});
