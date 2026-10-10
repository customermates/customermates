import { describe, expect, it } from "vitest";

import { SidebarLayoutSchema } from "@/features/p13n/sidebar-layout.schema";

import {
  addSidebarSection,
  moveSidebarEntry,
  moveSidebarItem,
  removeSidebarSection,
  resolveSidebar,
  sectionsOf,
  setSidebarItemHidden,
  shiftSidebarEntry,
  shiftSidebarItem,
  sidebarDefaults,
  sidebarItemOrder,
  sidebarLayoutOf,
  updateSidebarSection,
} from "../sidebar-layout";

const groups = [
  { key: "overview", items: [{ key: "dashboard" }, { key: "inbox" }] },
  { key: "data", items: [{ key: "records:a" }, { key: "records:b" }, { key: "configure-records" }] },
  { key: "top-level", topLevel: true, items: [{ key: "trash" }] },
];
const defaults = sidebarDefaults(groups);
const shown = () => true;

function shape(resolved: ReturnType<typeof resolveSidebar>) {
  return resolved.entries.map((entry) => (entry.kind === "item" ? entry.id : [entry.id, entry.name, entry.items]));
}

describe("personal sidebar layout", () => {
  it("seeds Overview and Data with built-in top-level pages at the end when nothing is stored", () => {
    expect(shape(resolveSidebar(defaults, null))).toEqual([
      ["overview", null, ["dashboard", "inbox"]],
      ["data", null, ["records:a", "records:b", "configure-records"]],
      "trash",
    ]);
  });

  it("keeps a migrated layout as stored and never recreates a section the person deleted", () => {
    const resolved = resolveSidebar(defaults, {
      entries: [
        { id: "custom:1", name: "Sales", items: ["records:b", "records:gone"] },
        { item: "dashboard" },
        { id: "data", items: ["configure-records", "records:a"], collapsed: true },
        { item: "trash" },
      ],
      hidden: ["records:gone"],
    });
    expect(shape(resolved)).toEqual([
      ["custom:1", "Sales", ["records:b", "records:gone"]],
      "dashboard",
      ["data", null, ["configure-records", "records:a"]],
      "trash",
      "inbox",
    ]);
    expect(sectionsOf(resolved).find((section) => section.id === "data")?.collapsed).toBe(true);
  });

  it("puts a new list right after the person's last list and new built-in pages at the end of the top level", () => {
    const withNewItems = sidebarDefaults([
      groups[0],
      { ...groups[1], items: [...groups[1].items, { key: "records:new" }, { key: "records:newer" }] },
      { ...groups[2], items: [{ key: "trash" }, { key: "routines" }] },
    ]);
    const resolved = resolveSidebar(withNewItems, {
      entries: [
        { item: "records:b" },
        { id: "data", items: ["records:a", "configure-records"] },
        { id: "overview", items: ["dashboard", "inbox"] },
        { item: "trash" },
      ],
      hidden: [],
    });
    expect(shape(resolved)).toEqual([
      "records:b",
      ["data", null, ["records:a", "records:new", "records:newer", "configure-records"]],
      ["overview", null, ["dashboard", "inbox"]],
      "trash",
      "routines",
    ]);
  });

  it("adds a new list at the end of the top level when the person has no list in the sidebar", () => {
    const resolved = resolveSidebar(defaults, {
      entries: [{ id: "overview", items: ["dashboard", "inbox", "configure-records", "trash"] }],
      hidden: [],
    });
    expect(shape(resolved)).toEqual([
      ["overview", null, ["dashboard", "inbox", "configure-records", "trash"]],
      "records:a",
      "records:b",
    ]);
  });

  it("deletes any section, seeded ones included, by moving its items to the top level in place", () => {
    const resolved = removeSidebarSection(resolveSidebar(defaults, null), "overview");
    expect(shape(resolved)).toEqual([
      "dashboard",
      "inbox",
      ["data", null, ["records:a", "records:b", "configure-records"]],
      "trash",
    ]);
    expect(shape(resolveSidebar(defaults, sidebarLayoutOf(resolved)))).toEqual(shape(resolved));
  });

  it("renames a seeded section and keeps the name through a stored round trip", () => {
    const renamed = updateSidebarSection(resolveSidebar(defaults, null), "data", { name: "Lists" });
    const reloaded = resolveSidebar(defaults, sidebarLayoutOf(renamed));
    expect(sectionsOf(reloaded).map((section) => [section.id, section.name])).toEqual([
      ["overview", null],
      ["data", "Lists"],
    ]);
  });

  it("moves items between the top level and sections, shifting past hidden items", () => {
    let resolved = resolveSidebar(defaults, null);
    resolved = moveSidebarItem(resolved, "inbox", null, 0);
    resolved = moveSidebarItem(resolved, "trash", "overview", 1);
    resolved = setSidebarItemHidden(resolved, "records:b", true);
    const hiddenAware = (item: string) => !resolved.hidden.has(item);
    resolved = shiftSidebarItem(resolved, "configure-records", -1, hiddenAware);
    expect(shape(resolved)).toEqual([
      "inbox",
      ["overview", null, ["dashboard", "trash"]],
      ["data", null, ["configure-records", "records:a", "records:b"]],
    ]);
    resolved = shiftSidebarItem(resolved, "inbox", 1, shown);
    expect(resolved.entries.map((entry) => entry.id)).toEqual(["overview", "inbox", "data"]);
  });

  it("reorders sections among top-level entries and adds a section after a given entry", () => {
    let resolved = resolveSidebar(defaults, null);
    resolved = shiftSidebarEntry(resolved, "section:data", -1, shown);
    resolved = moveSidebarEntry(resolved, "trash", "section:data");
    resolved = addSidebarSection(resolved, "custom:2", "Pinned", "trash");
    expect(resolved.entries.map((entry) => entry.id)).toEqual(["trash", "custom:2", "data", "overview"]);
    expect(sidebarItemOrder(resolved)).toEqual([
      "trash",
      "records:a",
      "records:b",
      "configure-records",
      "dashboard",
      "inbox",
    ]);
  });

  it("stores top-level items and sections in one ordered list and validates names and duplicates", () => {
    const stored = sidebarLayoutOf(moveSidebarItem(resolveSidebar(defaults, null), "inbox", null, 0));
    expect(stored).toEqual({
      entries: [
        { item: "inbox" },
        { id: "overview", items: ["dashboard"] },
        { id: "data", items: ["records:a", "records:b", "configure-records"] },
        { item: "trash" },
      ],
      hidden: [],
    });
    expect(SidebarLayoutSchema.safeParse(stored).success).toBe(true);
    expect(SidebarLayoutSchema.safeParse({ entries: [{ id: "custom:x", items: [] }], hidden: [] }).success).toBe(false);
    expect(
      SidebarLayoutSchema.safeParse({ entries: [{ item: "inbox" }, { id: "data", items: ["inbox"] }], hidden: [] })
        .success,
    ).toBe(false);
    expect(SidebarLayoutSchema.safeParse({ sections: [], hidden: [] }).success).toBe(false);
  });
});
