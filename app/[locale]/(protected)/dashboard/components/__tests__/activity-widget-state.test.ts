import { describe, expect, it } from "vitest";
import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";

import { accountSupportsActivitySources, resolveActivityWidgetState } from "../activity-widget-state";

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
};

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
