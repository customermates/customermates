import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";

import { describe, expect, it } from "vitest";

import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";

import { RAIL_VISIBLE_LIMIT, isOrphanedView, orderChips, viewMenuItems } from "../view-rail-model";

function chip(overrides: Partial<DataViewChipDto> & { id: string }): DataViewChipDto {
  return {
    isOwner: true,
    name: `view ${overrides.id}`,
    position: 0,
    state: {},
    visibility: "private",
    ...overrides,
  };
}

function views(count: number): DataViewChipDto[] {
  return Array.from({ length: count }, (_, index) => chip({ id: `v${index}`, position: index }));
}

function ids(chips: ReturnType<typeof orderChips>["chips"]): string[] {
  return chips.map((entry) => (entry.kind === "view" ? entry.view.id : entry.kind));
}

describe("view rail model", () => {
  it("puts All first and orders views by position", () => {
    const unordered = [chip({ id: "c", position: 2 }), chip({ id: "a", position: 0 }), chip({ id: "b", position: 1 })];

    const { chips, hiddenCount } = orderChips(unordered, ALL_VIEW_KEY, false);

    expect(ids(chips)).toEqual(["all", "a", "b", "c"]);
    expect(hiddenCount).toBe(0);
    expect(chips[0]).toEqual({ isActive: true, isDirty: false, kind: "all" });
  });

  it("breaks a position tie by name then id so the order never flickers", () => {
    const tied = [
      chip({ id: "z", name: "alpha", position: 5 }),
      chip({ id: "a", name: "alpha", position: 5 }),
      chip({ id: "m", name: "beta", position: 5 }),
    ];

    expect(ids(orderChips(tied, ALL_VIEW_KEY, false).chips)).toEqual(["all", "a", "z", "m"]);
    expect(ids(orderChips([...tied].reverse(), ALL_VIEW_KEY, false).chips)).toEqual(["all", "a", "z", "m"]);
  });

  it("keeps the views you own ahead of the ones shared with you, whatever the positions say", () => {
    const mixed = [
      chip({ id: "beta", name: "Beta", position: 1 }),
      chip({ id: "zulu", isOwner: false, name: "Zulu", position: 0, visibility: "workspace" }),
      chip({ id: "alpha", name: "Alpha", position: 0 }),
    ];

    expect(ids(orderChips(mixed, ALL_VIEW_KEY, false).chips)).toEqual(["all", "alpha", "beta", "zulu"]);
  });

  it("moves a chip exactly one slot when the owner swaps positions with its neighbour", () => {
    const before = [
      chip({ id: "alpha", name: "Alpha", position: 0 }),
      chip({ id: "beta", name: "Beta", position: 1 }),
      chip({ id: "zulu", isOwner: false, name: "Zulu", position: 0, visibility: "workspace" }),
    ];
    const after = before.map((view) => {
      if (view.id === "beta") return { ...view, position: 0 };
      if (view.id === "alpha") return { ...view, position: 1 };
      return view;
    });

    expect(ids(orderChips(before, ALL_VIEW_KEY, false).chips)).toEqual(["all", "alpha", "beta", "zulu"]);
    expect(ids(orderChips(after, ALL_VIEW_KEY, false).chips)).toEqual(["all", "beta", "alpha", "zulu"]);
  });

  it("caps the rail at the visible limit including All", () => {
    const { chips, hiddenCount } = orderChips(views(20), ALL_VIEW_KEY, false);

    expect(chips).toHaveLength(RAIL_VISIBLE_LIMIT);
    expect(chips.filter((entry) => entry.kind === "view")).toHaveLength(RAIL_VISIBLE_LIMIT - 1);
    expect(hiddenCount).toBe(20 - (RAIL_VISIBLE_LIMIT - 1));
  });

  it("forces the active view into the last slot when it falls outside the cut", () => {
    const { chips, hiddenCount } = orderChips(views(20), "v15", false);

    expect(ids(chips).at(-1)).toBe("v15");
    expect(ids(chips).slice(0, 3)).toEqual(["all", "v0", "v1"]);
    expect(ids(chips)).not.toContain("v10");
    expect(hiddenCount).toBe(20 - (RAIL_VISIBLE_LIMIT - 1));

    const active = chips.find((entry) => entry.kind === "view" && entry.view.id === "v15");
    expect(active).toMatchObject({ isActive: true });
  });

  it("leaves an already visible active view in its own slot", () => {
    const { chips } = orderChips(views(20), "v3", true);

    expect(ids(chips).at(-1)).toBe("v10");
    expect(chips.filter((entry) => entry.kind !== "orphan" && entry.isActive)).toHaveLength(1);
    expect(chips.find((entry) => entry.kind === "view" && entry.view.id === "v3")).toMatchObject({ isDirty: true });
  });

  it("marks only the active chip dirty", () => {
    const allDirty = orderChips(views(3), ALL_VIEW_KEY, true).chips;
    expect(allDirty[0]).toEqual({ isActive: true, isDirty: true, kind: "all" });
    expect(allDirty.filter((entry) => entry.kind !== "orphan" && entry.isDirty)).toHaveLength(1);

    const viewDirty = orderChips(views(3), "v1", true).chips;
    expect(viewDirty[0]).toEqual({ isActive: false, isDirty: false, kind: "all" });
    expect(viewDirty.filter((entry) => entry.kind !== "orphan" && entry.isDirty)).toHaveLength(1);
  });

  it("keeps the honest counts when there is nothing to hide", () => {
    expect(orderChips([], ALL_VIEW_KEY, false)).toEqual({
      chips: [{ isActive: true, isDirty: false, kind: "all" }],
      hiddenCount: 0,
    });
    expect(orderChips(views(RAIL_VISIBLE_LIMIT - 1), ALL_VIEW_KEY, false).hiddenCount).toBe(0);
  });

  it("is orphaned only when a non-All active key matches nothing", () => {
    expect(isOrphanedView(views(3), ALL_VIEW_KEY)).toBe(false);
    expect(isOrphanedView(views(3), "v1")).toBe(false);
    expect(isOrphanedView(views(3), "gone")).toBe(true);
    expect(isOrphanedView([], "gone")).toBe(true);
    expect(isOrphanedView([], ALL_VIEW_KEY)).toBe(false);
  });

  it("takes an orphan reported by the caller even while the active key is All", () => {
    const { chips } = orderChips(views(3), ALL_VIEW_KEY, true, true);

    expect(ids(chips)).toEqual(["all", "orphan", "v0", "v1", "v2"]);
    expect(chips[0]).toEqual({ isActive: false, isDirty: false, kind: "all" });
  });

  it("gives the orphan tombstone the slot after All and still caps the rail", () => {
    const { chips, hiddenCount } = orderChips(views(20), "gone", true);

    expect(ids(chips)[0]).toBe("all");
    expect(ids(chips)[1]).toBe("orphan");
    expect(chips).toHaveLength(RAIL_VISIBLE_LIMIT);
    expect(hiddenCount).toBe(20 - (RAIL_VISIBLE_LIMIT - 2));
    expect(chips[0]).toEqual({ isActive: false, isDirty: false, kind: "all" });
  });

  it("offers an owner the full menu with exactly one commit action while dirty", () => {
    const own = chip({ id: "v1", visibility: "workspace" });
    const ctx = { canShareViews: true, canWriteViews: true, index: 1, isDirty: true, total: 3 };
    const items = viewMenuItems(own, ctx);

    expect(items.map((item) => item.id)).toEqual([
      "saveChanges",
      "edit",
      "duplicate",
      "moveLeft",
      "moveRight",
      "share",
      "copyLink",
      "delete",
    ]);
    expect(items.filter((item) => item.isCommit)).toHaveLength(1);
    expect(items.find((item) => item.id === "share")).toMatchObject({ isChecked: true, kind: "checkbox" });
    expect(items.find((item) => item.id === "delete")?.isDestructive).toBe(true);
  });

  it("drops the commit action when the owner has nothing to save", () => {
    const items = viewMenuItems(chip({ id: "v1" }), {
      canShareViews: true,
      canWriteViews: true,
      index: 1,
      isDirty: false,
      total: 3,
    });

    expect(items.filter((item) => item.isCommit)).toHaveLength(0);
    expect(items.map((item) => item.id)).not.toContain("saveChanges");
    expect(items.find((item) => item.id === "share")?.isChecked).toBe(false);
  });

  it("disables each move at its end of the list", () => {
    const ctx = { canShareViews: true, canWriteViews: true, isDirty: false, total: 3 };
    const first = viewMenuItems(chip({ id: "v1" }), { ...ctx, index: 0 });
    const middle = viewMenuItems(chip({ id: "v1" }), { ...ctx, index: 1 });
    const last = viewMenuItems(chip({ id: "v1" }), { ...ctx, index: 2 });

    expect(first.find((item) => item.id === "moveLeft")?.isDisabled).toBe(true);
    expect(first.find((item) => item.id === "moveRight")?.isDisabled).toBe(false);
    expect(middle.every((item) => !item.isDisabled)).toBe(true);
    expect(last.find((item) => item.id === "moveLeft")?.isDisabled).toBe(false);
    expect(last.find((item) => item.id === "moveRight")?.isDisabled).toBe(true);
  });

  it("omits the ownership actions on a view you do not own and leads with duplicate", () => {
    const foreign = chip({ id: "v1", isOwner: false, visibility: "workspace" });
    const items = viewMenuItems(foreign, {
      canShareViews: true,
      canWriteViews: true,
      index: 1,
      isDirty: true,
      total: 3,
    });

    expect(items.map((item) => item.id)).toEqual(["duplicate", "saveAsNew", "copyLink"]);
    expect(items.filter((item) => item.isCommit)).toHaveLength(1);
    for (const id of ["edit", "saveChanges", "share", "delete", "moveLeft", "moveRight"])
      expect(items.map((item) => item.id)).not.toContain(id);
  });

  it("omits only the share toggle when sharing is withheld", () => {
    const items = viewMenuItems(chip({ id: "v1" }), {
      canShareViews: false,
      canWriteViews: true,
      index: 1,
      isDirty: true,
      total: 3,
    });

    expect(items.map((item) => item.id)).not.toContain("share");
    expect(items.map((item) => item.id)).toEqual([
      "saveChanges",
      "edit",
      "duplicate",
      "moveLeft",
      "moveRight",
      "copyLink",
      "delete",
    ]);
  });

  it("leaves a read-only rail with copy link alone", () => {
    const ctx = { canShareViews: false, canWriteViews: false, index: 1, isDirty: true, total: 3 };

    expect(viewMenuItems(chip({ id: "v1" }), ctx).map((item) => item.id)).toEqual(["copyLink"]);
    expect(viewMenuItems(chip({ id: "v1", isOwner: false }), ctx).map((item) => item.id)).toEqual(["copyLink"]);
  });
});
