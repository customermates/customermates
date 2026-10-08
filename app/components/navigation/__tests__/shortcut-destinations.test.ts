import type { NavGroup } from "../nav-main";

import { LayoutGrid } from "lucide-react";
import { describe, expect, it } from "vitest";

import { resolveSidebar } from "../sidebar-layout";
import { shortcutDestinations } from "../shortcut-destinations";

function item(key: string, href: string) {
  return { key, title: key, href, icon: LayoutGrid, visible: true };
}

const groups: NavGroup[] = [
  {
    key: "overview",
    label: "Overview",
    items: [item("dashboard", "/dashboard"), item("inbox", "/inbox")],
  },
  {
    key: "data",
    label: "Data",
    items: [
      item("records:a", "/records/a"),
      item("records:b", "/records/b"),
      item("records:c", "/records/c"),
      item("configure-records", "/configure"),
    ],
  },
];

const defaults = groups.map((group) => ({
  id: group.key,
  items: group.items.map((entry) => entry.key),
}));

describe("shortcut destinations", () => {
  it("maps fixed pages in the sidebar, the settings entry and lists in default order", () => {
    expect(shortcutDestinations(groups, resolveSidebar(defaults, null))).toEqual({
      pages: {
        dashboard: "/dashboard",
        inbox: "/inbox",
        configure: "/configure",
        settings: "/settings/profile",
      },
      lists: ["/records/a", "/records/b", "/records/c"],
    });
  });

  it("follows the person's own sidebar order and skips hidden lists", () => {
    const resolved = resolveSidebar(defaults, {
      sections: [
        { id: "custom:pinned", name: "Pinned", items: ["records:c"] },
        { id: "overview", items: ["dashboard", "inbox"] },
        { id: "data", items: ["records:b", "records:a", "configure-records"] },
      ],
      hidden: ["records:a"],
    });

    expect(shortcutDestinations(groups, resolved).lists).toEqual(["/records/c", "/records/b"]);
  });
});
