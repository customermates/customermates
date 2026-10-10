import type { SidebarLayout } from "@/features/p13n/sidebar-layout.schema";

import { SIDEBAR_SEEDED_SECTIONS } from "@/features/p13n/sidebar-layout.schema";

export type SidebarItemEntry = { kind: "item"; id: string };

export type SidebarSection = {
  kind: "section";
  id: string;
  name: string | null;
  items: string[];
  collapsed: boolean;
};

export type SidebarEntry = SidebarItemEntry | SidebarSection;

export type SidebarDefaultEntry = { kind: "item"; id: string } | { kind: "section"; id: string; items: string[] };

export type ResolvedSidebar = { entries: SidebarEntry[]; hidden: ReadonlySet<string> };

export type SidebarContainer = string | null;

export const CUSTOM_SECTION_PREFIX = "custom:";

const LIST_ITEM_PREFIX = "records:";

export function isSeededSection(id: string) {
  return (SIDEBAR_SEEDED_SECTIONS as readonly string[]).includes(id);
}

export function sectionsOf(resolved: ResolvedSidebar): SidebarSection[] {
  return resolved.entries.filter((entry): entry is SidebarSection => entry.kind === "section");
}

export function entryKey(entry: SidebarEntry) {
  return entry.kind === "section" ? `section:${entry.id}` : entry.id;
}

export function sidebarItemOrder(resolved: ResolvedSidebar): string[] {
  return resolved.entries.flatMap((entry) => (entry.kind === "section" ? entry.items : [entry.id]));
}

export type SidebarDefaultGroup = { key: string; items: { key: string }[]; topLevel?: boolean };

export function sidebarDefaults(groups: SidebarDefaultGroup[]): SidebarDefaultEntry[] {
  return groups.flatMap((group): SidebarDefaultEntry[] =>
    group.topLevel
      ? group.items.map((item) => ({ kind: "item", id: item.key }))
      : [{ kind: "section", id: group.key, items: group.items.map((item) => item.key) }],
  );
}

function seed(defaults: SidebarDefaultEntry[]): SidebarEntry[] {
  return defaults.map((entry) =>
    entry.kind === "section"
      ? { kind: "section", id: entry.id, name: null, items: [...entry.items], collapsed: false }
      : { kind: "item", id: entry.id },
  );
}

function insertAfterLastList(entries: SidebarEntry[], item: string) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.kind === "item" && entry.id.startsWith(LIST_ITEM_PREFIX)) {
      entries.splice(index + 1, 0, { kind: "item", id: item });
      return;
    }
    if (entry.kind === "section") {
      const last = entry.items.findLastIndex((candidate) => candidate.startsWith(LIST_ITEM_PREFIX));
      if (last >= 0) {
        entry.items.splice(last + 1, 0, item);
        return;
      }
    }
  }
  entries.push({ kind: "item", id: item });
}

export function resolveSidebar(defaults: SidebarDefaultEntry[], layout: SidebarLayout | null): ResolvedSidebar {
  if (!layout) return { entries: seed(defaults), hidden: new Set() };

  const placed = new Set<string>();
  const place = (item: string) => {
    if (placed.has(item)) return false;
    placed.add(item);
    return true;
  };
  const entries: SidebarEntry[] = layout.entries.flatMap((entry): SidebarEntry[] => {
    if ("item" in entry) return place(entry.item) ? [{ kind: "item", id: entry.item }] : [];
    return [
      {
        kind: "section",
        id: entry.id,
        name: entry.name ?? null,
        items: entry.items.filter(place),
        collapsed: entry.collapsed ?? false,
      },
    ];
  });

  for (const item of defaults.flatMap((entry) => (entry.kind === "section" ? entry.items : [entry.id]))) {
    if (!place(item)) continue;
    if (item.startsWith(LIST_ITEM_PREFIX)) insertAfterLastList(entries, item);
    else entries.push({ kind: "item", id: item });
  }

  return { entries, hidden: new Set(layout.hidden) };
}

export function sidebarLayoutOf(resolved: ResolvedSidebar): SidebarLayout {
  return {
    entries: resolved.entries.map((entry) =>
      entry.kind === "item"
        ? { item: entry.id }
        : {
            id: entry.id,
            ...(entry.name ? { name: entry.name } : {}),
            items: [...entry.items],
            ...(entry.collapsed ? { collapsed: true } : {}),
          },
    ),
    hidden: [...resolved.hidden],
  };
}

export function containerOf(resolved: ResolvedSidebar, item: string): SidebarContainer | undefined {
  for (const entry of resolved.entries) {
    if (entry.kind === "item" && entry.id === item) return null;
    if (entry.kind === "section" && entry.items.includes(item)) return entry.id;
  }
  return undefined;
}

function withoutItem(entries: SidebarEntry[], item: string): SidebarEntry[] {
  return entries.flatMap((entry): SidebarEntry[] => {
    if (entry.kind === "item") return entry.id === item ? [] : [entry];
    return [{ ...entry, items: entry.items.filter((candidate) => candidate !== item) }];
  });
}

export function moveSidebarItem(
  resolved: ResolvedSidebar,
  item: string,
  container: SidebarContainer,
  index?: number,
): ResolvedSidebar {
  const entries = withoutItem(resolved.entries, item);
  if (container === null) {
    entries.splice(index ?? entries.length, 0, { kind: "item", id: item });
    return { ...resolved, entries };
  }
  const target = entries.find((entry): entry is SidebarSection => entry.kind === "section" && entry.id === container);
  if (!target) return resolved;
  target.items.splice(index ?? target.items.length, 0, item);
  return { ...resolved, entries };
}

export function moveSidebarItemBefore(resolved: ResolvedSidebar, item: string, before: string): ResolvedSidebar {
  if (item === before) return resolved;
  const entries = withoutItem(resolved.entries, item);
  const container = containerOf({ ...resolved, entries }, before);
  if (container === undefined) return resolved;
  if (container === null) {
    const index = entries.findIndex((entry) => entry.kind === "item" && entry.id === before);
    return moveSidebarItem(resolved, item, null, index);
  }
  const section = entries.find((entry): entry is SidebarSection => entry.kind === "section" && entry.id === container);
  return moveSidebarItem(resolved, item, container, section?.items.indexOf(before));
}

export function shiftSidebarItem(
  resolved: ResolvedSidebar,
  item: string,
  by: -1 | 1,
  isShown: (item: string) => boolean,
): ResolvedSidebar {
  const container = containerOf(resolved, item);
  if (container === undefined) return resolved;
  if (container === null) return shiftSidebarEntry(resolved, item, by, (key) => key === item || isShown(key));
  const section = sectionsOf(resolved).find((candidate) => candidate.id === container);
  if (!section) return resolved;
  const visible = section.items.filter((candidate) => candidate === item || isShown(candidate));
  const neighbour = visible[visible.indexOf(item) + by];
  if (!neighbour) return resolved;
  const items = section.items.filter((candidate) => candidate !== item);
  items.splice(items.indexOf(neighbour) + (by > 0 ? 1 : 0), 0, item);
  return {
    ...resolved,
    entries: resolved.entries.map((entry) => (entry === section ? { ...section, items } : entry)),
  };
}

export function shiftSidebarEntry(
  resolved: ResolvedSidebar,
  key: string,
  by: -1 | 1,
  isShown: (key: string) => boolean,
): ResolvedSidebar {
  const keys = resolved.entries.map(entryKey);
  const visible = keys.filter((candidate) => candidate === key || isShown(candidate));
  const neighbour = visible[visible.indexOf(key) + by];
  if (!visible.includes(key) || !neighbour) return resolved;
  return moveSidebarEntry(resolved, key, neighbour);
}

export function moveSidebarEntry(resolved: ResolvedSidebar, key: string, targetKey: string): ResolvedSidebar {
  const from = resolved.entries.findIndex((entry) => entryKey(entry) === key);
  const to = resolved.entries.findIndex((entry) => entryKey(entry) === targetKey);
  if (from < 0 || to < 0 || from === to) return resolved;
  const entries = [...resolved.entries];
  const [moving] = entries.splice(from, 1);
  entries.splice(to, 0, moving);
  return { ...resolved, entries };
}

export function addSidebarSection(
  resolved: ResolvedSidebar,
  id: string,
  name: string,
  afterKey?: string,
): ResolvedSidebar {
  const entries = [...resolved.entries];
  const after = afterKey ? entries.findIndex((entry) => entryKey(entry) === afterKey) : -1;
  entries.splice(after < 0 ? entries.length : after + 1, 0, { kind: "section", id, name, items: [], collapsed: false });
  return { ...resolved, entries };
}

export function updateSidebarSection(
  resolved: ResolvedSidebar,
  sectionId: string,
  change: Partial<Pick<SidebarSection, "name" | "collapsed">>,
): ResolvedSidebar {
  return {
    ...resolved,
    entries: resolved.entries.map((entry) =>
      entry.kind === "section" && entry.id === sectionId ? { ...entry, ...change } : entry,
    ),
  };
}

export function removeSidebarSection(resolved: ResolvedSidebar, sectionId: string): ResolvedSidebar {
  return {
    ...resolved,
    entries: resolved.entries.flatMap((entry): SidebarEntry[] =>
      entry.kind === "section" && entry.id === sectionId
        ? entry.items.map((item) => ({ kind: "item", id: item }))
        : [entry],
    ),
  };
}

export function setSidebarItemHidden(resolved: ResolvedSidebar, item: string, hidden: boolean): ResolvedSidebar {
  const next = new Set(resolved.hidden);
  if (hidden) next.add(item);
  else next.delete(item);
  return { ...resolved, hidden: next };
}
