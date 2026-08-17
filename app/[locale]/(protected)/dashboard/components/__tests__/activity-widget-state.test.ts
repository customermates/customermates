import { describe, expect, it } from "vitest";
import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";
import type { Filter } from "@/core/base/base-get.schema";

import { ACTIVITY_KINDS } from "@/ee/messaging/activities/activities.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FilterOperatorKey } from "@/core/base/base-query-builder";

import {
  accountSupportsActivitySources,
  activityWidgetSourcePlan,
  requestedActivitySources,
  resolveActivityWidgetState,
} from "../activity-widget-state";

const ready = {
  accountsError: false,
  accountsReady: true,
  availableRequestedSources: ["audit", "message", "activity", "calendar_event"] as const,
  constrained: false,
  connectedAccountCount: 1,
  filtering: false,
  itemCount: 1,
  loadError: false,
  ready: true,
  requestedSources: ["audit", "message", "activity", "calendar_event"] as const,
  scopeTruncated: false,
};

function timelineKindFilter(operator: FilterOperatorKey.in | FilterOperatorKey.notIn, value: string[]): Filter {
  return { field: FilterFieldKey.timelineKind, operator, value } as Filter;
}

describe("requestedActivitySources", () => {
  it.each([
    [[], []],
    [["changes"], ["audit"]],
    [["messages"], ["message"]],
    [["activities"], ["activity", "calendar_event"]],
    [
      ["changes", "messages"],
      ["audit", "message"],
    ],
    [
      ["changes", "activities"],
      ["audit", "activity", "calendar_event"],
    ],
    [
      ["messages", "activities"],
      ["message", "activity", "calendar_event"],
    ],
    [["changes", "messages", "activities"], ACTIVITY_KINDS],
  ] as const)("maps the activity-type card selection %j to %j", (selected, expected) => {
    const filter =
      selected.length === 0
        ? timelineKindFilter(FilterOperatorKey.notIn, ["changes", "messages", "activities"])
        : timelineKindFilter(FilterOperatorKey.in, [...selected]);

    expect(requestedActivitySources([filter])).toEqual(expected);
  });

  it("hydrates grouped and raw subtype restrictions with in/notIn semantics", () => {
    expect(requestedActivitySources(undefined)).toEqual(ACTIVITY_KINDS);
    expect(requestedActivitySources([timelineKindFilter(FilterOperatorKey.in, [])])).toEqual(ACTIVITY_KINDS);
    expect(requestedActivitySources([timelineKindFilter(FilterOperatorKey.notIn, [])])).toEqual(ACTIVITY_KINDS);
    expect(requestedActivitySources([timelineKindFilter(FilterOperatorKey.in, ["audit", "calendar_event"])])).toEqual([
      "audit",
      "calendar_event",
    ]);
    expect(requestedActivitySources([timelineKindFilter(FilterOperatorKey.notIn, ["activity"])])).toEqual([
      "audit",
      "message",
      "calendar_event",
    ]);
  });

  it("intersects requested sources with permissions before requiring accounts", () => {
    expect(activityWidgetSourcePlan([timelineKindFilter(FilterOperatorKey.in, ["changes"])], ACTIVITY_KINDS)).toEqual({
      availableRequestedSources: ["audit"],
      connectedAccountSources: [],
      requestedSources: ["audit"],
    });
    expect(activityWidgetSourcePlan([timelineKindFilter(FilterOperatorKey.in, ["messages"])], ["audit"])).toEqual({
      availableRequestedSources: [],
      connectedAccountSources: [],
      requestedSources: ["message"],
    });
  });
});

describe("accountSupportsActivitySources", () => {
  const messagingAccount = {
    hasMessaging: true,
    hasCalendar: false,
  } as ConnectedAccountDto;
  const calendarAccount = {
    hasMessaging: false,
    hasCalendar: true,
  } as ConnectedAccountDto;

  it("counts only accounts that can serve the requested source kinds", () => {
    expect(accountSupportsActivitySources(messagingAccount, ["message"])).toBe(true);
    expect(accountSupportsActivitySources(messagingAccount, ["calendar_event"])).toBe(false);
    expect(accountSupportsActivitySources(calendarAccount, ["message"])).toBe(false);
    expect(accountSupportsActivitySources(calendarAccount, ["calendar_event"])).toBe(true);
    expect(accountSupportsActivitySources(messagingAccount, ["activity"])).toBe(true);
    expect(accountSupportsActivitySources(calendarAccount, ["activity"])).toBe(false);
    expect(accountSupportsActivitySources(calendarAccount, ["activity", "calendar_event"])).toBe(true);
    expect(accountSupportsActivitySources(messagingAccount, [])).toBe(false);
  });
});

describe("resolveActivityWidgetState", () => {
  it.each([
    [{ ...ready, availableRequestedSources: [] }, "noPermission"],
    [{ ...ready, availableRequestedSources: [], itemCount: 0, loadError: true }, "error"],
    [{ ...ready, ready: false }, "loading"],
    [{ ...ready, filtering: true }, "loading"],
    [{ ...ready, accountsReady: false }, "loading"],
    [{ ...ready, accountsError: true }, "error"],
    [{ ...ready, itemCount: 0, loadError: true }, "error"],
    [{ ...ready, itemCount: 0, scopeTruncated: true }, "scopeTooBroad"],
    [{ ...ready, constrained: true, itemCount: 0, requestedSources: [] }, "noMatches"],
    [
      {
        ...ready,
        availableRequestedSources: [],
        requestedSources: ["audit"],
      },
      "noPermission",
    ],
    [
      {
        ...ready,
        availableRequestedSources: [],
        requestedSources: ["message"],
      },
      "noPermission",
    ],
    [
      {
        ...ready,
        availableRequestedSources: ["message"],
        constrained: true,
        connectedAccountCount: 0,
        itemCount: 0,
        requestedSources: ["message"],
      },
      "noAccount",
    ],
    [
      {
        ...ready,
        availableRequestedSources: ["message"],
        constrained: true,
        connectedAccountCount: 1,
        itemCount: 0,
        requestedSources: ["message"],
      },
      "noMatches",
    ],
    [
      {
        ...ready,
        availableRequestedSources: ["message"],
        connectedAccountCount: 0,
        itemCount: 1,
        requestedSources: ["message"],
      },
      "content",
    ],
    [
      {
        ...ready,
        availableRequestedSources: ["audit", "message"],
        connectedAccountCount: 0,
        itemCount: 0,
        requestedSources: ["audit", "message"],
      },
      "noActivity",
    ],
    [{ ...ready, itemCount: 0 }, "noActivity"],
    [{ ...ready, constrained: true, itemCount: 0 }, "noMatches"],
    [ready, "content"],
  ] as const)("resolves %s to %s", (input, expected) => {
    expect(resolveActivityWidgetState(input)).toBe(expected);
  });
});
