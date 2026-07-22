import { describe, it, expect } from "vitest";

import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FilterOperatorKey } from "@/core/base/base-query-builder";

import { interpretFilters } from "../timeline-filters";

const CHANNEL = FilterFieldKey.connectedAccountId;
const A = "16000000-0000-4000-8000-000000000001";
const B = "16000000-0000-4000-8000-000000000002";

describe("interpretFilters — channel (connectedAccountId) dimension", () => {
  it("parses an `in` channel filter into connectedAccountIdsIn", () => {
    const query = interpretFilters([{ field: CHANNEL, operator: FilterOperatorKey.in, value: [A, B] }]);

    expect(query.connectedAccountIdsIn).toEqual(new Set([A, B]));
    expect(query.connectedAccountIdsNotIn).toBeUndefined();
  });

  it("parses a `notIn` channel filter into connectedAccountIdsNotIn", () => {
    const query = interpretFilters([{ field: CHANNEL, operator: FilterOperatorKey.notIn, value: [A] }]);

    expect(query.connectedAccountIdsNotIn).toEqual(new Set([A]));
    expect(query.connectedAccountIdsIn).toBeUndefined();
  });

  it("ignores an empty channel value array (cleared filter = no constraint)", () => {
    const query = interpretFilters([{ field: CHANNEL, operator: FilterOperatorKey.in, value: [] }]);

    expect(query.connectedAccountIdsIn).toBeUndefined();
    expect(query.connectedAccountIdsNotIn).toBeUndefined();
  });

  it("keeps channel independent from provider and conversation in one filter set", () => {
    const query = interpretFilters([
      { field: FilterFieldKey.provider, operator: FilterOperatorKey.in, value: ["google"] },
      { field: FilterFieldKey.timelineThreadId, operator: FilterOperatorKey.in, value: [B] },
      { field: CHANNEL, operator: FilterOperatorKey.in, value: [A] },
    ]);

    expect(query.providers).toEqual(new Set(["google"]));
    expect(query.threadIdsIn).toEqual(new Set([B]));
    expect(query.connectedAccountIdsIn).toEqual(new Set([A]));
    expect(query.connectedAccountIdsIn).not.toEqual(query.providers);
  });

  it("does not set channel keys when no channel filter is present", () => {
    const query = interpretFilters([
      { field: FilterFieldKey.provider, operator: FilterOperatorKey.in, value: ["google"] },
    ]);

    expect(query.connectedAccountIdsIn).toBeUndefined();
    expect(query.connectedAccountIdsNotIn).toBeUndefined();
  });
});
