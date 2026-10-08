import { describe, expect, it } from "vitest";

import {
  addSidebarSection,
  moveSidebarItem,
  removeSidebarSection,
  resolveSidebar,
  setSidebarItemHidden,
  shiftSidebarItem,
  shiftSidebarSection,
  sidebarLayoutOf,
} from "../sidebar-layout";

const defaults = [
  { id: "overview", items: ["dashboard", "inbox"] },
  { id: "data", items: ["records:a", "records:b", "configure-records"] },
  { id: "workspace", items: ["profile"] },
];

describe("personal sidebar layout", () => {
  it("uses the default layout when nothing is stored", () => {
    const resolved = resolveSidebar(defaults, null);
    expect(resolved.sections.map((section) => [section.id, section.items])).toEqual([
      ["overview", ["dashboard", "inbox"]],
      ["data", ["records:a", "records:b", "configure-records"]],
      ["workspace", ["profile"]],
    ]);
    expect(resolved.hidden.size).toBe(0);
  });

  it("keeps stored order and sections, drops unknown items and adds new lists to their default section", () => {
    const resolved = resolveSidebar(
      [...defaults.slice(0, 1), { ...defaults[1], items: [...defaults[1].items, "records:new"] }, defaults[2]],
      {
        sections: [
          { id: "custom:1", name: "Sales", items: ["records:b", "records:gone"] },
          { id: "data", items: ["configure-records", "records:a"] },
          { id: "overview", items: ["inbox"], collapsed: true },
        ],
        hidden: ["dashboard", "records:gone"],
      },
    );
    expect(resolved.sections.map((section) => [section.id, section.name, section.items, section.collapsed])).toEqual([
      ["custom:1", "Sales", ["records:b"], false],
      ["data", null, ["configure-records", "records:a", "records:new"], false],
      ["overview", null, ["dashboard", "inbox"], true],
      ["workspace", null, ["profile"], false],
    ]);
    expect([...resolved.hidden]).toEqual(["dashboard"]);
  });

  it("moves, shifts past hidden items, hides and round-trips to a stored layout", () => {
    let resolved = resolveSidebar(defaults, null);
    resolved = setSidebarItemHidden(resolved, "records:b", true);
    resolved = shiftSidebarItem(resolved, "configure-records", -1);
    expect(resolved.sections[1]?.items).toEqual(["configure-records", "records:a", "records:b"]);
    resolved = moveSidebarItem(resolved, "inbox", "workspace", 0);
    expect(resolved.sections[2]?.items).toEqual(["inbox", "profile"]);
    resolved = shiftSidebarSection(resolved, "workspace", -1, new Set(["overview", "data", "workspace"]));
    expect(resolved.sections.map((section) => section.id)).toEqual(["overview", "workspace", "data"]);
    const reloaded = resolveSidebar(defaults, sidebarLayoutOf(resolved));
    expect([reloaded.sections, reloaded.hidden]).toEqual([resolved.sections, resolved.hidden]);
  });

  it("moves sections past hidden ones and keeps entries of items that are absent right now", () => {
    const stored = {
      sections: [
        { id: "data", items: ["records:b", "records:later", "records:a"] },
        { id: "admin", items: ["operator"] },
        { id: "overview", items: ["inbox"] },
      ],
      hidden: ["wiki"],
    };
    let resolved = resolveSidebar(defaults, stored);
    resolved = shiftSidebarSection(resolved, "overview", -1, new Set(["data", "overview", "workspace"]));
    expect(resolved.sections.map((section) => section.id)).toEqual(["overview", "data", "workspace"]);
    resolved = setSidebarItemHidden(resolved, "inbox", true);
    expect(sidebarLayoutOf(resolved)).toEqual({
      sections: [
        { id: "overview", items: ["dashboard", "inbox"] },
        { id: "data", items: ["records:b", "records:a", "configure-records", "records:later"] },
        { id: "workspace", items: ["profile"] },
        { id: "admin", items: ["operator"] },
      ],
      hidden: ["inbox", "wiki"],
    });
  });

  it("adds a personal section after another section and returns its items to their default place when deleted", () => {
    let resolved = addSidebarSection(resolveSidebar(defaults, null), "custom:2", "Pinned", "overview");
    resolved = moveSidebarItem(resolved, "records:a", "custom:2");
    expect(resolved.sections.map((section) => section.id)).toEqual(["overview", "custom:2", "data", "workspace"]);
    const stored = sidebarLayoutOf(removeSidebarSection(resolved, "custom:2"));
    expect(resolveSidebar(defaults, stored).sections[1]?.items).toEqual([
      "records:a",
      "records:b",
      "configure-records",
    ]);
  });
});
