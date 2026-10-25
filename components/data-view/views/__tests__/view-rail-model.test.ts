import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";

import { describe, expect, it } from "vitest";

import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";

import { allViewMenuItems, orderChips, suggestedViewName, viewMenuItems } from "../view-rail-model";

function chip(overrides: Partial<DataViewChipDto> & { id: string }): DataViewChipDto {
  return {
    name: `view ${overrides.id}`,
    position: 0,
    state: {},
    ...overrides,
  };
}

function views(count: number): DataViewChipDto[] {
  return Array.from({ length: count }, (_, index) => chip({ id: `v${index}`, position: index }));
}

function ids(chips: ReturnType<typeof orderChips>): string[] {
  return chips.map((entry) => entry.view.id);
}

describe("view rail model", () => {
  it("lists only the saved views, ordered by position", () => {
    const unordered = [chip({ id: "c", position: 2 }), chip({ id: "a", position: 0 }), chip({ id: "b", position: 1 })];

    const chips = orderChips(unordered, ALL_VIEW_KEY);

    expect(ids(chips)).toEqual(["a", "b", "c"]);
    expect(chips.some((entry) => entry.isActive)).toBe(false);
  });

  it("breaks a position tie by name then id so the order never flickers", () => {
    const tied = [
      chip({ id: "z", name: "alpha", position: 5 }),
      chip({ id: "a", name: "alpha", position: 5 }),
      chip({ id: "m", name: "beta", position: 5 }),
    ];

    expect(ids(orderChips(tied, ALL_VIEW_KEY))).toEqual(["a", "z", "m"]);
    expect(ids(orderChips([...tied].reverse(), ALL_VIEW_KEY))).toEqual(["a", "z", "m"]);
  });

  it("moves a chip exactly one slot when positions are swapped with a neighbour", () => {
    const before = [chip({ id: "alpha", name: "Alpha", position: 0 }), chip({ id: "beta", name: "Beta", position: 1 })];
    const after = before.map((view) => ({ ...view, position: view.id === "beta" ? 0 : 1 }));

    expect(ids(orderChips(before, ALL_VIEW_KEY))).toEqual(["alpha", "beta"]);
    expect(ids(orderChips(after, ALL_VIEW_KEY))).toEqual(["beta", "alpha"]);
  });

  it("never caps the rail, however many views there are", () => {
    const chips = orderChips(views(40), "v33");

    expect(chips).toHaveLength(40);
    expect(chips.filter((entry) => entry.isActive)).toHaveLength(1);
    expect(chips.find((entry) => entry.view.id === "v33")).toMatchObject({ isActive: true });
  });

  it("marks the active view and no tab at all without a view or for a key that matches no view", () => {
    expect(orderChips(views(3), "v1").map((entry) => entry.isActive)).toEqual([false, true, false]);
    expect(orderChips(views(3), ALL_VIEW_KEY).map((entry) => entry.isActive)).toEqual([false, false, false]);
    expect(orderChips(views(3), "gone").map((entry) => entry.isActive)).toEqual([false, false, false]);
    expect(orderChips([], ALL_VIEW_KEY)).toEqual([]);
  });

  it("offers the same six actions on every view, in a fixed order", () => {
    const items = viewMenuItems({ index: 1, total: 3 });

    expect(items.map((item) => item.id)).toEqual(["edit", "duplicate", "moveLeft", "moveRight", "copyLink", "delete"]);
    expect(items.filter((item) => item.isDestructive).map((item) => item.id)).toEqual(["delete"]);
    expect(items.every((item) => !item.isDisabled)).toBe(true);
  });

  it("disables each move at its end of the list", () => {
    const first = viewMenuItems({ index: 0, total: 3 });
    const last = viewMenuItems({ index: 2, total: 3 });
    const only = viewMenuItems({ index: 0, total: 1 });

    expect(first.find((item) => item.id === "moveLeft")?.isDisabled).toBe(true);
    expect(first.find((item) => item.id === "moveRight")?.isDisabled).toBe(false);
    expect(last.find((item) => item.id === "moveLeft")?.isDisabled).toBe(false);
    expect(last.find((item) => item.id === "moveRight")?.isDisabled).toBe(true);
    expect(only.filter((item) => item.isDisabled).map((item) => item.id)).toEqual(["moveLeft", "moveRight"]);
  });

  it("offers only Copy link for the All tab, which cannot be edited, moved, duplicated or deleted", () => {
    expect(allViewMenuItems().map((item) => item.id)).toEqual(["copyLink"]);
  });

  it("names a view after its filters, capped at the view name limit on a part boundary", () => {
    expect(suggestedViewName(["Provider: Cursor", " Status: Open "], "My filters")).toBe(
      "Provider: Cursor · Status: Open",
    );
    expect(suggestedViewName(["", "  "], "My filters")).toBe("My filters");
    expect(suggestedViewName([], "My filters")).toBe("My filters");

    const long = suggestedViewName(["Owner: Ada Lovelace", "Stage: Qualified, Proposal", "Region: Europe, Asia"], "x");
    expect(long).toBe("Owner: Ada Lovelace · Stage: Qualified, Proposal");
    expect(long.length).toBeLessThanOrEqual(60);

    const single = suggestedViewName(["Company: " + "A".repeat(80)], "x");
    expect(single).toHaveLength(60);
    expect(single.endsWith("…")).toBe(true);
  });
});
