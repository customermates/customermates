import type { SidebarLayout } from "@/features/p13n/sidebar-layout.schema";

export type SidebarDefaultSection = { id: string; items: string[] };

export type SidebarSection = {
  id: string;
  name: string | null;
  items: string[];
  collapsed: boolean;
};

type AbsentEntries = {
  items: ReadonlyMap<string, string[]>;
  sections: SidebarLayout["sections"];
  hidden: string[];
};

export type ResolvedSidebar = { sections: SidebarSection[]; hidden: ReadonlySet<string>; absent: AbsentEntries };

const NOTHING_ABSENT: AbsentEntries = { items: new Map(), sections: [], hidden: [] };

export const CUSTOM_SECTION_PREFIX = "custom:";

export function isCustomSection(id: string) {
  return id.startsWith(CUSTOM_SECTION_PREFIX);
}

export function resolveSidebar(defaults: SidebarDefaultSection[], layout: SidebarLayout | null): ResolvedSidebar {
  const homes = new Map(defaults.flatMap((section) => section.items.map((item) => [item, section.id])));
  if (!layout) {
    return {
      sections: defaults.map((section) => ({ id: section.id, name: null, items: section.items, collapsed: false })),
      hidden: new Set(),
      absent: NOTHING_ABSENT,
    };
  }
  const placed = new Set<string>();
  const known = new Set(defaults.map((section) => section.id));
  const sections: SidebarSection[] = layout.sections
    .filter((section) => known.has(section.id) || isCustomSection(section.id))
    .map((section) => ({
      id: section.id,
      name: isCustomSection(section.id) ? (section.name ?? null) : null,
      collapsed: section.collapsed ?? false,
      items: section.items.filter((item) => {
        if (!homes.has(item) || placed.has(item)) return false;
        placed.add(item);
        return true;
      }),
    }));
  for (const section of defaults) {
    if (!sections.some((candidate) => candidate.id === section.id))
      sections.push({ id: section.id, name: null, items: [], collapsed: false });
  }
  for (const [item, home] of homes)
    if (!placed.has(item)) sections.find((section) => section.id === home)?.items.push(item);
  return {
    sections,
    hidden: new Set(layout.hidden.filter((item) => homes.has(item))),
    absent: {
      items: new Map(layout.sections.map((section) => [section.id, section.items.filter((item) => !homes.has(item))])),
      sections: layout.sections.filter((section) => !known.has(section.id) && !isCustomSection(section.id)),
      hidden: layout.hidden.filter((item) => !homes.has(item)),
    },
  };
}

export function sidebarLayoutOf(resolved: ResolvedSidebar): SidebarLayout {
  return {
    sections: [
      ...resolved.sections.map((section) => ({
        id: section.id,
        ...(section.name ? { name: section.name } : {}),
        items: [...section.items, ...(resolved.absent.items.get(section.id) ?? [])],
        ...(section.collapsed ? { collapsed: true } : {}),
      })),
      ...resolved.absent.sections,
    ],
    hidden: [...resolved.hidden, ...resolved.absent.hidden],
  };
}

export function sectionOfItem(resolved: ResolvedSidebar, item: string) {
  return resolved.sections.find((section) => section.items.includes(item)) ?? null;
}

export function moveSidebarItem(
  resolved: ResolvedSidebar,
  item: string,
  sectionId: string,
  index?: number,
): ResolvedSidebar {
  const sections = resolved.sections.map((section) => ({
    ...section,
    items: section.items.filter((candidate) => candidate !== item),
  }));
  const target = sections.find((section) => section.id === sectionId);
  if (!target) return resolved;
  target.items.splice(index ?? target.items.length, 0, item);
  return { ...resolved, sections };
}

export function shiftSidebarItem(resolved: ResolvedSidebar, item: string, by: -1 | 1): ResolvedSidebar {
  const section = sectionOfItem(resolved, item);
  if (!section) return resolved;
  const visible = section.items.filter((candidate) => !resolved.hidden.has(candidate));
  const neighbour = visible[visible.indexOf(item) + by];
  if (!neighbour) return resolved;
  const items = section.items.filter((candidate) => candidate !== item);
  items.splice(items.indexOf(neighbour) + (by > 0 ? 1 : 0), 0, item);
  return {
    ...resolved,
    sections: resolved.sections.map((candidate) => (candidate.id === section.id ? { ...candidate, items } : candidate)),
  };
}

export function shiftSidebarSection(
  resolved: ResolvedSidebar,
  sectionId: string,
  by: -1 | 1,
  shown: ReadonlySet<string>,
): ResolvedSidebar {
  const order = resolved.sections.filter((section) => shown.has(section.id)).map((section) => section.id);
  const neighbour = order[order.indexOf(sectionId) + by];
  if (!order.includes(sectionId) || !neighbour) return resolved;
  const sections = [...resolved.sections];
  const from = sections.findIndex((section) => section.id === sectionId);
  const to = sections.findIndex((section) => section.id === neighbour);
  [sections[from], sections[to]] = [sections[to], sections[from]];
  return { ...resolved, sections };
}

export function addSidebarSection(
  resolved: ResolvedSidebar,
  id: string,
  name: string,
  afterSectionId: string,
): ResolvedSidebar {
  const sections = [...resolved.sections];
  const after = sections.findIndex((section) => section.id === afterSectionId);
  sections.splice(after < 0 ? sections.length : after + 1, 0, { id, name, items: [], collapsed: false });
  return { ...resolved, sections };
}

export function updateSidebarSection(
  resolved: ResolvedSidebar,
  sectionId: string,
  change: Partial<Pick<SidebarSection, "name" | "collapsed">>,
): ResolvedSidebar {
  return {
    ...resolved,
    sections: resolved.sections.map((section) => (section.id === sectionId ? { ...section, ...change } : section)),
  };
}

export function removeSidebarSection(resolved: ResolvedSidebar, sectionId: string): ResolvedSidebar {
  return { ...resolved, sections: resolved.sections.filter((section) => section.id !== sectionId) };
}

export function setSidebarItemHidden(resolved: ResolvedSidebar, item: string, hidden: boolean): ResolvedSidebar {
  const next = new Set(resolved.hidden);
  if (hidden) next.add(item);
  else next.delete(item);
  return { ...resolved, hidden: next };
}
