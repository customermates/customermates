import type { Filter } from "@/core/base/base-get.schema";

import { describe, expect, it } from "vitest";

import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { decodeGetParams, encodeGetParams } from "@/core/utils/get-params";

describe("filter URL parameters", () => {
  it("preserves dynamic references, delimiters in selected values and system sorting/grouping", () => {
    const filters: Filter[] = [
      { field: "relationship:8f1c1a4e-0b2d-4a9e-9d7c-1f2a3b4c5d6e:outgoing", operator: FilterOperatorKey.hasSome },
      { field: "system:assignedTo", operator: FilterOperatorKey.in, value: ["8f1c1a4e-0b2d-4a9e-9d7c-1f2a3b4c5d6e"] },
      { field: "system:updatedAt", operator: FilterOperatorKey.inLastDays, value: 7 },
      { field: "name", operator: FilterOperatorKey.in, value: ["Smith, Taylor", "Text: includes, delimiters"] },
    ];
    const sortDescriptor = { field: "system:createdAt", direction: "desc" as const };
    const grouping = { field: "system:createdAt", bucket: "month" as const };
    const decoded = decodeGetParams(
      new URLSearchParams(encodeGetParams({ filters, sortDescriptor, grouping }).toString()),
    );
    expect(decoded).toMatchObject({ filters, sortDescriptor, grouping });
  });

  it("decodes existing dynamic URLs and rejects malformed versioned filter tokens", () => {
    const encoded = new URLSearchParams();
    encoded.append("filters", "system:updatedAt:inLastDays:7");
    encoded.append("filters", "v2.{malformed}");
    encoded.append("filters", 'v2.{"field":"name","operator":"execute","value":"unsafe"}');
    expect(decodeGetParams(encoded).filters).toEqual([
      { field: "system:updatedAt", operator: FilterOperatorKey.inLastDays, value: 7 },
    ]);
  });

  it.each([FilterOperatorKey.in, FilterOperatorKey.notIn] as const)(
    "preserves account folder references for %s after a real URL round trip",
    (operator) => {
      const accountId = "b1b2c3d4-1234-4123-8123-123456789abc";
      const filters: Filter[] = [
        {
          field: FilterFieldKey.emailFolder,
          operator,
          value: [JSON.stringify([accountId, "inbox"]), JSON.stringify([accountId, 'Projects, München:50%/"α"'])],
        },
      ];
      const url = new URL(`https://example.invalid/inbox?${encodeGetParams({ filters }).toString()}`);
      expect(decodeGetParams(url.searchParams).filters).toEqual(filters);
    },
  );

  it("preserves list values that start with the encoded-list marker", () => {
    const filters: Filter[] = [{ field: "status", operator: FilterOperatorKey.in, value: ['json:["open"]'] }];
    expect(decodeGetParams(new URLSearchParams(encodeGetParams({ filters }).toString())).filters).toEqual(filters);
  });

  it.each(["json:[1]", "json:{}", "json:["])("ignores a malformed encoded list %s", (value) => {
    expect(decodeGetParams(new URLSearchParams({ filters: `emailFolder:in:${value}` })).filters).toEqual([]);
  });

  it("round trips relation existence filters without a value token", () => {
    const filters: Filter[] = [
      { field: FilterFieldKey.ownerUserId, operator: FilterOperatorKey.hasNone },
      { field: FilterFieldKey.timelineThreadId, operator: FilterOperatorKey.hasSome },
    ];

    const encoded = encodeGetParams({ filters });

    expect(encoded.getAll("filters")).toEqual(["ownerUserId:hasNone", "timelineThreadId:hasSome"]);
    expect(decodeGetParams(encoded).filters).toEqual(filters);
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
});
