import { afterEach, describe, expect, it, vi } from "vitest";

import { BaseQueryBuilder, FilterOperatorKey } from "../base-query-builder";
import { FilterSchema, type Filter } from "../base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { encodeGetParams, decodeGetParams } from "@/core/utils/get-params";

class DateQueryBuilder extends BaseQueryBuilder<Record<string, unknown>> {
  override getFilterableFields() {
    return Promise.resolve([
      { field: FilterFieldKey.createdAt, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.createdAt] },
    ]);
  }
}

describe("combinable relative date filters", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps older-than and recent-window cutoffs dynamic and AND-combined", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const filters: Filter[] = [
      { field: FilterFieldKey.createdAt, operator: FilterOperatorKey.notInLastDays, value: 3 },
      { field: FilterFieldKey.createdAt, operator: FilterOperatorKey.inLastDays, value: 7 },
    ];
    vi.setSystemTime(new Date(2026, 9, 11, 12));
    expect((await new DateQueryBuilder().buildQueryArgs({ filters })).where).toEqual({
      AND: [{ createdAt: { lt: new Date(2026, 9, 8) } }, { createdAt: { gte: new Date(2026, 9, 4) } }],
    });
    vi.setSystemTime(new Date(2026, 9, 12, 12));
    expect((await new DateQueryBuilder().buildQueryArgs({ filters })).where).toEqual({
      AND: [{ createdAt: { lt: new Date(2026, 9, 9) } }, { createdAt: { gte: new Date(2026, 9, 5) } }],
    });
  });

  it("round-trips both numeric bounds alongside an account-qualified folder", () => {
    const filters: Filter[] = [
      { field: FilterFieldKey.lastMessageSentAt, operator: FilterOperatorKey.notInLastDays, value: 3 },
      { field: FilterFieldKey.lastMessageSentAt, operator: FilterOperatorKey.inLastDays, value: 7 },
      {
        field: FilterFieldKey.emailFolder,
        operator: FilterOperatorKey.in,
        value: [JSON.stringify(["00000000-0000-4000-8000-000000000001", "inbox"])],
      },
    ];
    const decoded = decodeGetParams(encodeGetParams({ filters })).filters;
    expect(decoded).toEqual(filters);
    expect(decoded?.map((filter) => FilterSchema.parse(filter))).toEqual(filters);
  });

  describe.each([FilterOperatorKey.inLastDays, FilterOperatorKey.notInLastDays])("%s day counts", (operator) => {
    const invalidDayCounts = [
      0,
      -1,
      3.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "three",
      true,
      false,
      [3],
      ["3"],
      null,
      {},
    ];
    it.each(invalidDayCounts.map((value) => ({ value })))("rejects an invalid day count $value", ({ value }) => {
      expect(FilterSchema.safeParse({ field: FilterFieldKey.lastMessageSentAt, operator, value }).success).toBe(false);
    });

    it.each([3, "3", " 3 "])("preserves numeric URL compatibility for %j", (value) => {
      expect(FilterSchema.parse({ field: FilterFieldKey.lastMessageSentAt, operator, value })).toEqual({
        field: FilterFieldKey.lastMessageSentAt,
        operator,
        value: 3,
      });
    });
  });
});
