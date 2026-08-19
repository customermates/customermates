import { describe, expect, it } from "vitest";

import type { Filter } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import {
  resolveFilterDateGranularity,
  resolveFilterValueClass,
  shouldPreserveFilterValue,
} from "../filter-value-class";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";

const COLUMN_OPERATORS: Record<string, FilterOperatorKey[]> = {
  singleSelect: [FilterOperatorKey.in, FilterOperatorKey.notIn, FilterOperatorKey.isNull, FilterOperatorKey.isNotNull],
  currency: [
    FilterOperatorKey.equals,
    FilterOperatorKey.gt,
    FilterOperatorKey.gte,
    FilterOperatorKey.lt,
    FilterOperatorKey.lte,
    FilterOperatorKey.isNull,
    FilterOperatorKey.isNotNull,
  ],
  date: [
    FilterOperatorKey.gt,
    FilterOperatorKey.gte,
    FilterOperatorKey.lt,
    FilterOperatorKey.lte,
    FilterOperatorKey.between,
    FilterOperatorKey.isNull,
    FilterOperatorKey.isNotNull,
  ],
  dateRange: [
    FilterOperatorKey.contains,
    FilterOperatorKey.gt,
    FilterOperatorKey.gte,
    FilterOperatorKey.lt,
    FilterOperatorKey.lte,
    FilterOperatorKey.between,
    FilterOperatorKey.isNull,
    FilterOperatorKey.isNotNull,
  ],
  plain: [FilterOperatorKey.equals, FilterOperatorKey.contains, FilterOperatorKey.isNull, FilterOperatorKey.isNotNull],
};

const COLUMN_ID = "16000000-0000-4000-8000-000000000001";

function column(type: string): CustomColumnDto[] {
  return [{ id: COLUMN_ID, type, name: type }] as unknown as CustomColumnDto[];
}

function filter(field: string, operator: FilterOperatorKey | undefined, value: unknown): Filter {
  return { field, operator, value } as unknown as Filter;
}

function valueFor(kind: string): unknown {
  if (kind === "stringArray") return ["30000000-0000-4000-8000-000000000001"];
  if (kind === "numericString") return "1000";
  if (kind === "isoDate") return "2026-08-19T00:00:00.000Z";
  if (kind === "isoRange") return ["2026-08-01T00:00:00.000Z", "2026-08-19T00:00:00.000Z"];
  if (kind === "daysCount") return 30;
  return "acme";
}

function orderedPairs(operators: FilterOperatorKey[]) {
  return operators.flatMap((from) => operators.filter((to) => to !== from).map((to) => [from, to] as const));
}

describe("filter value class", () => {
  it("gives every value-less operator the same class regardless of field", () => {
    const standalone = [
      FilterOperatorKey.isNull,
      FilterOperatorKey.isNotNull,
      FilterOperatorKey.hasNone,
      FilterOperatorKey.hasSome,
      FilterOperatorKey.hasUnset,
      FilterOperatorKey.allSet,
    ];

    for (const operator of standalone) {
      expect(resolveFilterValueClass(FilterFieldKey.userIds, operator)).toBe("none");
      expect(resolveFilterValueClass(COLUMN_ID, operator, column("currency"))).toBe("none");
    }
  });

  it("reports an unresolvable custom column rather than guessing a class", () => {
    expect(resolveFilterValueClass(COLUMN_ID, FilterOperatorKey.equals, [])).toBe("unavailable");
  });

  it("classifies every operator each standard field actually offers", () => {
    const expected: Record<string, string> = {
      [FilterFieldKey.userIds]: "stringArray",
      [FilterFieldKey.contactIds]: "stringArray",
      [FilterFieldKey.timelineKind]: "stringArray",
      [FilterFieldKey.participantContactId]: "stringArray",
      [FilterFieldKey.url]: "text",
    };

    for (const [field, valueClass] of Object.entries(expected)) {
      for (const operator of FILTER_FIELD_DEFAULT_OPERATORS[field as FilterFieldKey]) {
        const resolved = resolveFilterValueClass(field, operator);
        expect(resolved).toBe(resolved === "none" ? "none" : valueClass);
      }
    }
  });

  it("splits date fields by operator", () => {
    expect(resolveFilterValueClass(FilterFieldKey.createdAt, FilterOperatorKey.gt)).toBe("isoDate");
    expect(resolveFilterValueClass(FilterFieldKey.createdAt, FilterOperatorKey.between)).toBe("isoRange");
    expect(resolveFilterValueClass(FilterFieldKey.createdAt, FilterOperatorKey.inLastDays)).toBe("daysCount");
  });

  it("uses day granularity only for the date-only custom column types", () => {
    expect(resolveFilterDateGranularity(COLUMN_ID, column("date"))).toBe("day");
    expect(resolveFilterDateGranularity(COLUMN_ID, column("dateRange"))).toBe("day");
    expect(resolveFilterDateGranularity(COLUMN_ID, column("dateTime"))).toBe("minute");
    expect(resolveFilterDateGranularity(FilterFieldKey.createdAt)).toBe("minute");
  });
});

describe("preserving a filter value across an operator change", () => {
  it("keeps the selection when a relation field flips between in and notIn", () => {
    const current = filter(FilterFieldKey.userIds, FilterOperatorKey.in, valueFor("stringArray"));

    expect(shouldPreserveFilterValue(current, FilterOperatorKey.notIn)).toBe(true);
  });

  it("keeps the entered text when a text field flips between equals and contains", () => {
    const current = filter(COLUMN_ID, FilterOperatorKey.contains, "acme");

    expect(shouldPreserveFilterValue(current, FilterOperatorKey.equals, column("plain"))).toBe(true);
  });

  it("keeps the entered amount across every currency comparison", () => {
    for (const [from, to] of orderedPairs([
      FilterOperatorKey.equals,
      FilterOperatorKey.gt,
      FilterOperatorKey.gte,
      FilterOperatorKey.lt,
      FilterOperatorKey.lte,
    ])) {
      const current = filter(COLUMN_ID, from, "1000");

      expect(shouldPreserveFilterValue(current, to, column("currency"))).toBe(true);
    }
  });

  it("keeps the chosen date across every date comparison", () => {
    for (const [from, to] of orderedPairs([
      FilterOperatorKey.gt,
      FilterOperatorKey.gte,
      FilterOperatorKey.lt,
      FilterOperatorKey.lte,
    ])) {
      const current = filter(FilterFieldKey.createdAt, from, valueFor("isoDate"));

      expect(shouldPreserveFilterValue(current, to)).toBe(true);
    }
  });

  it("never carries a value onto a value-less operator", () => {
    const current = filter(FilterFieldKey.userIds, FilterOperatorKey.in, valueFor("stringArray"));

    expect(shouldPreserveFilterValue(current, FilterOperatorKey.hasSome)).toBe(false);
    expect(shouldPreserveFilterValue(current, FilterOperatorKey.hasNone)).toBe(false);
  });

  it("never carries a value a value-less operator was already holding", () => {
    const poisoned = filter(FilterFieldKey.userIds, FilterOperatorKey.hasSome, valueFor("stringArray"));

    expect(shouldPreserveFilterValue(poisoned, FilterOperatorKey.in)).toBe(false);
  });

  it("clears whenever the value shape changes", () => {
    const single = filter(FilterFieldKey.createdAt, FilterOperatorKey.gt, valueFor("isoDate"));
    const range = filter(FilterFieldKey.createdAt, FilterOperatorKey.between, valueFor("isoRange"));
    const days = filter(FilterFieldKey.createdAt, FilterOperatorKey.inLastDays, 30);

    expect(shouldPreserveFilterValue(single, FilterOperatorKey.between)).toBe(false);
    expect(shouldPreserveFilterValue(range, FilterOperatorKey.gt)).toBe(false);
    expect(shouldPreserveFilterValue(single, FilterOperatorKey.inLastDays)).toBe(false);
    expect(shouldPreserveFilterValue(days, FilterOperatorKey.gt)).toBe(false);
    expect(shouldPreserveFilterValue(range, FilterOperatorKey.inLastDays)).toBe(false);
  });

  it("clears a value the new operator could not use even when the class matches", () => {
    const emptySelection = filter(FilterFieldKey.userIds, FilterOperatorKey.in, []);
    const blankText = filter(COLUMN_ID, FilterOperatorKey.contains, "");
    const unparseableAmount = filter(COLUMN_ID, FilterOperatorKey.gt, "abc");

    expect(shouldPreserveFilterValue(emptySelection, FilterOperatorKey.notIn)).toBe(false);
    expect(shouldPreserveFilterValue(blankText, FilterOperatorKey.equals, column("plain"))).toBe(false);
    expect(shouldPreserveFilterValue(unparseableAmount, FilterOperatorKey.lt, column("currency"))).toBe(false);
  });

  it("clears when the field renders a text input but the wire wants a list", () => {
    const calendarField = filter(FilterFieldKey.calendarId, FilterOperatorKey.in, ["cal-1"]);

    expect(resolveFilterValueClass(FilterFieldKey.calendarId, FilterOperatorKey.in)).toBe("text");
    expect(shouldPreserveFilterValue(calendarField, FilterOperatorKey.notIn)).toBe(false);
  });

  it("clears every remaining reachable transition on a custom column", () => {
    for (const [type, operators] of Object.entries(COLUMN_OPERATORS)) {
      for (const [from, to] of orderedPairs(operators)) {
        const fromClass = resolveFilterValueClass(COLUMN_ID, from, column(type));
        const toClass = resolveFilterValueClass(COLUMN_ID, to, column(type));
        const current = filter(COLUMN_ID, from, valueFor(fromClass));
        const preserved = shouldPreserveFilterValue(current, to, column(type));

        expect(preserved).toBe(fromClass !== "none" && toClass !== "none" && fromClass === toClass);
      }
    }
  });

  it("clears when the custom column backing the value cannot be resolved", () => {
    const orphan = filter(COLUMN_ID, FilterOperatorKey.contains, "acme");

    expect(shouldPreserveFilterValue(orphan, FilterOperatorKey.equals, [])).toBe(false);
  });
});
