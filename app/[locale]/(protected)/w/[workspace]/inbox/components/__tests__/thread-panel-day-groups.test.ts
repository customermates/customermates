import { describe, expect, it } from "vitest";

import { groupMessagesByDay } from "../thread-panel";

function message(id: string, sentAt: string) {
  return { id, sentAt: new Date(sentAt) };
}

describe("groupMessagesByDay", () => {
  it("returns no groups for an empty thread", () => {
    expect(groupMessagesByDay([])).toEqual([]);
  });

  it("keeps one day in a single group, so only one separator can ever pin for it", () => {
    const messages = [
      message("a", "2026-08-20T08:00:00"),
      message("b", "2026-08-20T13:30:00"),
      message("c", "2026-08-20T23:59:00"),
    ];

    const groups = groupMessagesByDay(messages);

    expect(groups).toHaveLength(1);
    expect(groups[0].messages).toEqual(messages);
  });

  it("opens a new group on each calendar-day boundary", () => {
    const groups = groupMessagesByDay([
      message("a", "2026-08-20T23:59:00"),
      message("b", "2026-08-21T00:01:00"),
      message("c", "2026-08-21T09:00:00"),
      message("d", "2026-08-22T09:00:00"),
    ]);

    expect(groups.map((group) => group.messages.map((m) => m.id))).toEqual([["a"], ["b", "c"], ["d"]]);
  });

  it("dates each group from its own first message", () => {
    const groups = groupMessagesByDay([message("a", "2026-08-20T23:59:00"), message("b", "2026-08-21T00:01:00")]);

    expect(groups.map((group) => group.date.toISOString())).toEqual([
      new Date("2026-08-20T23:59:00").toISOString(),
      new Date("2026-08-21T00:01:00").toISOString(),
    ]);
  });

  it("preserves every message exactly once and in order", () => {
    const messages = [
      message("a", "2026-08-20T08:00:00"),
      message("b", "2026-08-21T08:00:00"),
      message("c", "2026-08-21T09:00:00"),
      message("d", "2026-08-23T08:00:00"),
    ];

    const flattened = groupMessagesByDay(messages).flatMap((group) => group.messages);

    expect(flattened).toEqual(messages);
  });

  it("gives every group a distinct key, including when a day recurs out of order", () => {
    const groups = groupMessagesByDay([
      message("a", "2026-08-20T08:00:00"),
      message("b", "2026-08-21T08:00:00"),
      message("c", "2026-08-20T09:00:00"),
    ]);

    expect(groups.map((group) => group.key)).toEqual(["a", "b", "c"]);
    expect(new Set(groups.map((group) => group.key)).size).toBe(groups.length);
  });

  it("accepts a serialized sentAt, which is what crosses the server boundary", () => {
    const groups = groupMessagesByDay([
      { id: "a", sentAt: "2026-08-20T08:00:00.000Z" },
      { id: "b", sentAt: "2026-08-20T09:00:00.000Z" },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].date).toBeInstanceOf(Date);
  });

  it("re-groups a prepended older page without repeating a day that is already grouped", () => {
    const loaded = [message("c", "2026-08-21T08:00:00"), message("d", "2026-08-21T09:00:00")];
    const olderPage = [message("a", "2026-08-19T08:00:00"), message("b", "2026-08-21T07:00:00")];

    const groups = groupMessagesByDay([...olderPage, ...loaded]);

    expect(groups.map((group) => group.messages.map((m) => m.id))).toEqual([["a"], ["b", "c", "d"]]);
    expect(groups).toHaveLength(2);
  });

  it("does not mutate the messages it is given", () => {
    const messages = [message("a", "2026-08-20T08:00:00"), message("b", "2026-08-21T08:00:00")];
    const snapshot = [...messages];

    groupMessagesByDay(messages);

    expect(messages).toEqual(snapshot);
  });
});
