import type { Filter } from "@/core/base/base-get.schema";

import { describe, it, expect } from "vitest";
import { EntityType } from "@/generated/prisma";

import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FilterOperatorKey } from "@/core/base/base-query-builder";

import { interpretFilters } from "../timeline-filters";

const CHANNEL = FilterFieldKey.connectedAccountId;
const A = "16000000-0000-4000-8000-000000000001";
const B = "16000000-0000-4000-8000-000000000002";

describe("interpretFilters channel (connectedAccountId) dimension", () => {
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
      {
        field: FilterFieldKey.provider,
        operator: FilterOperatorKey.in,
        value: ["google"],
      },
    ]);

    expect(query.connectedAccountIdsIn).toBeUndefined();
    expect(query.connectedAccountIdsNotIn).toBeUndefined();
  });
});

describe("interpretFilters relationship dimensions", () => {
  it.each(
    [
      [FilterFieldKey.contactIds, EntityType.contact],
      [FilterFieldKey.organizationIds, EntityType.organization],
      [FilterFieldKey.dealIds, EntityType.deal],
      [FilterFieldKey.serviceIds, EntityType.service],
      [FilterFieldKey.taskIds, EntityType.task],
    ].flatMap(([field, entityType]) =>
      [
        [field, entityType, FilterOperatorKey.in, [A, B]],
        [field, entityType, FilterOperatorKey.notIn, [B]],
        [field, entityType, FilterOperatorKey.hasSome, undefined],
        [field, entityType, FilterOperatorKey.hasNone, undefined],
      ].map((entry) => entry as [FilterFieldKey, EntityType, FilterOperatorKey, string[] | undefined]),
    ),
  )("maps %s to %s for %s", (field, entityType, operator, value) => {
    const filter = value ? { field, operator, value } : { field, operator };
    const query = interpretFilters([filter as Filter]);

    expect(query.relationshipRules).toEqual([value ? { entityType, operator, ids: value } : { entityType, operator }]);
  });

  it("ignores incomplete membership filters while preserving value-less filters", () => {
    const query = interpretFilters([
      {
        field: FilterFieldKey.contactIds,
        operator: FilterOperatorKey.in,
      } as Filter,
      {
        field: FilterFieldKey.dealIds,
        operator: FilterOperatorKey.hasNone,
        value: [A],
      } as Filter,
    ]);

    expect(query.relationshipRules).toEqual([{ entityType: EntityType.deal, operator: FilterOperatorKey.hasNone }]);
  });
});
