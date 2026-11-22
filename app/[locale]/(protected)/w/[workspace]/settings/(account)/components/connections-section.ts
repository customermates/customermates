import { settingsHref } from "@/app/components/navigation/settings-routes";

export const CONNECTIONS_SECTIONS = ["all", "inbox", "apps", "keys"] as const;

export type ConnectionsSection = (typeof CONNECTIONS_SECTIONS)[number];

export const CONNECTIONS_SECTION_PARAM = "section";

export function connectionsSectionOf(value: string | null | undefined): ConnectionsSection {
  return (CONNECTIONS_SECTIONS as readonly string[]).includes(value ?? "") ? (value as ConnectionsSection) : "all";
}

type SearchParams = Record<string, string | string[] | undefined>;

export function connectionsRedirectHref(searchParams: SearchParams, section: Exclude<ConnectionsSection, "all">) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined || key === CONNECTIONS_SECTION_PARAM) continue;
    for (const entry of Array.isArray(value) ? value : [value]) params.append(key, entry);
  }
  params.set(CONNECTIONS_SECTION_PARAM, section);
  return `${settingsHref("connections")}?${params.toString()}`;
}
