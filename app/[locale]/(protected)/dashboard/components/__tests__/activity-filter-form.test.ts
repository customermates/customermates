import { describe, expect, it } from "vitest";
import type { Filter } from "@/core/base/base-get.schema";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";

import {
  ACTIVITY_TYPE_VALUES,
  activityTypeStateForFilter,
  activityTypeSelectionFor,
  mergeActivityFiltersForForm,
} from "../activity-filter-form";

function typeFilter(operator: FilterOperatorKey.in | FilterOperatorKey.notIn, value: string[]): Filter {
  return {
    field: FilterFieldKey.timelineKind,
    operator,
    value,
  } as Filter;
}

describe("mergeActivityFiltersForForm", () => {
  it("orders activity filters by their selection dependencies", () => {
    const merged = mergeActivityFiltersForForm([
      {
        field: FilterFieldKey.timelineThreadId,
        operators: [FilterOperatorKey.in],
      },
      {
        field: FilterFieldKey.connectedAccountId,
        operators: [FilterOperatorKey.in],
      },
      { field: FilterFieldKey.timelineKind, operators: [FilterOperatorKey.in] },
      { field: FilterFieldKey.provider, operators: [FilterOperatorKey.in] },
    ]);

    expect(merged.map(({ field }) => field)).toEqual([
      FilterFieldKey.timelineKind,
      FilterFieldKey.provider,
      FilterFieldKey.connectedAccountId,
      FilterFieldKey.timelineThreadId,
    ]);
  });

  it("preserves saved filters that are hidden after a permission change", () => {
    const providerFilter: Filter = {
      field: FilterFieldKey.provider,
      operator: FilterOperatorKey.in,
      value: ["google"],
    };

    const merged = mergeActivityFiltersForForm(
      [
        {
          field: FilterFieldKey.timelineKind,
          operators: [FilterOperatorKey.in, FilterOperatorKey.notIn],
        },
      ],
      [providerFilter],
    );

    expect(merged).toContainEqual(providerFilter);
  });

  it("shows a grouped card as indeterminate when only one raw subtype is active", () => {
    expect(activityTypeStateForFilter(typeFilter(FilterOperatorKey.notIn, ["activity"]), "activities")).toBe(
      "indeterminate",
    );
    expect(activityTypeStateForFilter(typeFilter(FilterOperatorKey.in, ["calendar_event"]), "activities")).toBe(
      "indeterminate",
    );
  });

  it("preserves a raw subtype restriction when another grouped card changes", () => {
    expect(activityTypeSelectionFor(typeFilter(FilterOperatorKey.notIn, ["activity"]), "messages", false)).toEqual({
      operator: FilterOperatorKey.in,
      value: ["changes", "calendar_event"],
    });
  });

  it("adds and removes activity types without replacing the other selections", () => {
    const withChanges = activityTypeSelectionFor(typeFilter(FilterOperatorKey.in, ["messages"]), "changes", true);

    expect(withChanges).toEqual({
      operator: FilterOperatorKey.in,
      value: ["changes", "messages"],
    });
    expect(
      activityTypeSelectionFor(typeFilter(FilterOperatorKey.in, withChanges.value ?? []), "messages", false),
    ).toEqual({
      operator: FilterOperatorKey.in,
      value: ["changes"],
    });
  });

  it("normalizes all selected types to no restriction", () => {
    expect(
      activityTypeSelectionFor(typeFilter(FilterOperatorKey.in, ["changes", "messages"]), "activities", true),
    ).toEqual({ operator: undefined, value: undefined });
  });

  it("represents an empty card selection as an explicit exclusion instead of widening to all activity", () => {
    expect(activityTypeSelectionFor(typeFilter(FilterOperatorKey.in, ["messages"]), "messages", false)).toEqual({
      operator: FilterOperatorKey.notIn,
      value: ACTIVITY_TYPE_VALUES,
    });
  });
});
