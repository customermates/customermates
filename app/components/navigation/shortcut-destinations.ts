import type { ShortcutDestination } from "@/components/keyboard/shortcut-registry";
import type { ShortcutDestinations } from "@/app/components/keyboard-shortcuts/keyboard-shortcuts.store";
import type { NavGroup } from "./nav-main";
import type { ResolvedSidebar } from "./sidebar-layout";

import { SETTINGS_ENTRY_HREF } from "./settings-routes";

const PAGE_ITEMS: ReadonlyArray<[string, ShortcutDestination]> = [
  ["dashboard", "dashboard"],
  ["wiki", "wiki"],
  ["inbox", "inbox"],
  ["routines", "routines"],
  ["configure-records", "configure"],
];

const LIST_ITEM_PREFIX = "records:";

export function shortcutDestinations(groups: NavGroup[], resolved: ResolvedSidebar): ShortcutDestinations {
  const hrefs = new Map(groups.flatMap((group) => group.items.map((item) => [item.key, item.href] as const)));
  const pages = {
    ...Object.fromEntries(
      PAGE_ITEMS.flatMap(([item, destination]) => {
        const href = hrefs.get(item);
        return href ? [[destination, href]] : [];
      }),
    ),
    settings: SETTINGS_ENTRY_HREF,
  };
  const lists = resolved.sections
    .flatMap((section) => section.items)
    .filter((item) => item.startsWith(LIST_ITEM_PREFIX) && !resolved.hidden.has(item))
    .flatMap((item) => hrefs.get(item) ?? []);
  return { pages, lists };
}
