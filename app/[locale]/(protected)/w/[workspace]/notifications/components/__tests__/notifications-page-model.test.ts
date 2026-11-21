import { describe, expect, it } from "vitest";

import type { NotificationDto } from "@/features/notifications/notification.schema";

import {
  appendOlderPage,
  filterNotificationsForPage,
  groupNotificationsByAge,
  markItemsRead,
  mergeNewestPage,
  notificationAgeGroup,
  panelNotifications,
} from "../notifications-page-model";

function notification(id: string, createdAt: string, overrides: Partial<NotificationDto> = {}): NotificationDto {
  return {
    id,
    kind: "dueToday",
    title: `Title ${id}`,
    body: null,
    href: null,
    read: false,
    createdAt: new Date(createdAt).toISOString(),
    ...overrides,
  };
}

describe("notificationAgeGroup", () => {
  const now = new Date("2026-11-16T12:00:00");

  it("puts anything since midnight under today", () => {
    expect(notificationAgeGroup(new Date("2026-11-16T00:05:00"), now)).toBe("today");
  });

  it("puts the six days before today under this week, also across a month boundary", () => {
    expect(notificationAgeGroup(new Date("2026-11-15T23:55:00"), now)).toBe("thisWeek");
    expect(notificationAgeGroup(new Date("2026-11-10T00:00:00"), now)).toBe("thisWeek");
    expect(notificationAgeGroup(new Date("2026-10-30T12:00:00"), new Date("2026-11-02T09:00:00"))).toBe("thisWeek");
  });

  it("puts everything older under earlier", () => {
    expect(notificationAgeGroup(new Date("2026-11-09T23:59:00"), now)).toBe("earlier");
  });
});

describe("groupNotificationsByAge", () => {
  const now = new Date("2026-11-16T12:00:00");

  it("returns no sections for no notifications", () => {
    expect(groupNotificationsByAge([], now)).toEqual([]);
  });

  it("opens Today, This week and Earlier in that order, skips empty ones and keeps the order inside", () => {
    const items = [
      notification("a", "2026-11-16T10:00:00"),
      notification("b", "2026-11-16T08:00:00"),
      notification("c", "2026-11-01T09:00:00"),
    ];

    expect(groupNotificationsByAge(items, now)).toEqual([
      { group: "today", items: [items[0], items[1]] },
      { group: "earlier", items: [items[2]] },
    ]);
  });
});

describe("filterNotificationsForPage", () => {
  const items = [
    notification("a", "2026-11-16T10:00:00", { kind: "dueToday", read: true }),
    notification("b", "2026-11-16T09:00:00", { kind: "ruleAlert" }),
    notification("c", "2026-11-16T08:00:00", { kind: "replyReceived" }),
  ];

  it("keeps every notification for all", () => {
    expect(filterNotificationsForPage(items, "all").map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps only unread notifications for unread", () => {
    expect(filterNotificationsForPage(items, "unread").map((item) => item.id)).toEqual(["b", "c"]);
  });

  it("keeps only the chosen kind", () => {
    expect(filterNotificationsForPage(items, "ruleAlert").map((item) => item.id)).toEqual(["b"]);
  });
});

describe("panelNotifications", () => {
  const items = Array.from({ length: 10 }, (_, index) =>
    notification(String(index), "2026-11-16T10:00:00", { read: index % 2 === 0 }),
  );

  it("shows the newest eight of all notifications", () => {
    expect(panelNotifications(items, "all").map((item) => item.id)).toEqual(["0", "1", "2", "3", "4", "5", "6", "7"]);
  });

  it("shows only unread notifications for unread", () => {
    expect(panelNotifications(items, "unread").map((item) => item.id)).toEqual(["1", "3", "5", "7", "9"]);
  });
});

describe("page merging", () => {
  const first = notification("a", "2026-11-16T12:00:00");
  const second = notification("b", "2026-11-16T11:00:00");
  const third = notification("c", "2026-11-16T10:00:00");
  const fourth = notification("d", "2026-11-16T09:00:00");

  it("appends an older page without repeating a notification and takes its cursor", () => {
    const merged = appendOlderPage(
      { items: [first, second], nextBefore: second.createdAt },
      { items: [second, third], nextBefore: null },
    );

    expect(merged.items.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(merged.nextBefore).toBeNull();
  });

  it("puts new notifications in front and keeps the older pages and their cursor", () => {
    const fresh = notification("n", "2026-11-16T13:00:00");
    const merged = mergeNewestPage(
      { items: [first, second, third, fourth], nextBefore: fourth.createdAt },
      { items: [fresh, { ...first, read: true }, second], nextBefore: second.createdAt },
    );

    expect(merged.items.map((item) => item.id)).toEqual(["n", "a", "b", "c", "d"]);
    expect(merged.items[1].read).toBe(true);
    expect(merged.nextBefore).toBe(fourth.createdAt);
  });

  it("takes the cursor of the newest page when it covers everything loaded", () => {
    const merged = mergeNewestPage(
      { items: [first, second], nextBefore: null },
      { items: [first, second, third], nextBefore: third.createdAt },
    );

    expect(merged.items.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(merged.nextBefore).toBe(third.createdAt);
  });

  it("keeps the notifications of the same millisecond that sort after the last one of the newest page", () => {
    const at = "2026-11-16T11:00:00";
    const [one, two, three, four] = ["b1", "b2", "b3", "b4"].map((id) => notification(id, at));
    const merged = mergeNewestPage(
      { items: [first, one, two, three, four, fourth], nextBefore: "cursor-of-d" },
      { items: [first, { ...one, read: true }, two], nextBefore: "cursor-of-b2" },
    );

    expect(merged.items.map((item) => item.id)).toEqual(["a", "b1", "b2", "b3", "b4", "d"]);
    expect(merged.items[1].read).toBe(true);
    expect(merged.nextBefore).toBe("cursor-of-d");
  });

  it("drops a notification of the same millisecond that the newest page should have listed", () => {
    const at = "2026-11-16T11:00:00";
    const merged = mergeNewestPage(
      { items: [notification("b1", at), notification("b2", at), notification("b3", at)], nextBefore: null },
      { items: [notification("b1", at), notification("b3", at)], nextBefore: null },
    );

    expect(merged.items.map((item) => item.id)).toEqual(["b1", "b3"]);
  });

  it("drops a notification the newest page no longer lists", () => {
    const merged = mergeNewestPage({ items: [first, second], nextBefore: null }, { items: [second], nextBefore: null });

    expect(merged.items.map((item) => item.id)).toEqual(["b"]);
  });
});

describe("markItemsRead", () => {
  const items = [notification("a", "2026-11-16T12:00:00"), notification("b", "2026-11-16T11:00:00", { read: true })];

  it("marks the listed ids and leaves the others", () => {
    expect(markItemsRead(items, new Set(["a"])).map((item) => item.read)).toEqual([true, true]);
    expect(markItemsRead(items, new Set(["x"])).map((item) => item.read)).toEqual([false, true]);
  });

  it("marks everything for all and keeps already read items identical", () => {
    const marked = markItemsRead(items, "all");

    expect(marked.map((item) => item.read)).toEqual([true, true]);
    expect(marked[1]).toBe(items[1]);
  });
});
