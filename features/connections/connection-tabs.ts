export const CONNECTION_TABS = ["channels", "apps", "agents", "developers"] as const;
export type ConnectionTab = (typeof CONNECTION_TABS)[number];

export const CHANNEL_SECTIONS = ["accounts"] as const;
export type ChannelSection = (typeof CHANNEL_SECTIONS)[number];

export const DEVELOPER_SECTIONS = ["keys", "webhooks", "deliveries", "incoming"] as const;
export type DeveloperSection = (typeof DEVELOPER_SECTIONS)[number];

export type ConnectionSection = ChannelSection | DeveloperSection;

export const CONNECTION_TAB_PARAM = "tab";
export const CONNECTION_SECTION_PARAM = "section";

const SECTIONS_OF_TAB = {
  channels: CHANNEL_SECTIONS,
  apps: [],
  agents: [],
  developers: DEVELOPER_SECTIONS,
} as const satisfies Record<ConnectionTab, readonly ConnectionSection[]>;

export function connectionSectionsOf(tab: ConnectionTab): readonly ConnectionSection[] {
  return SECTIONS_OF_TAB[tab];
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function resolveConnectionTab(
  value: string | string[] | undefined,
  visible: readonly ConnectionTab[],
): ConnectionTab | null {
  const requested = firstValue(value);
  const match = visible.find((tab) => tab === requested);
  return match ?? visible[0] ?? null;
}

export function resolveConnectionSection(
  tab: ConnectionTab,
  value: string | string[] | undefined,
): ConnectionSection | null {
  const sections = connectionSectionsOf(tab);
  const requested = firstValue(value);
  return sections.find((section) => section === requested) ?? sections[0] ?? null;
}

export function connectionsHref(tab: ConnectionTab, section?: ConnectionSection | null): string {
  const params = new URLSearchParams({ [CONNECTION_TAB_PARAM]: tab });
  if (section && section !== connectionSectionsOf(tab)[0]) params.set(CONNECTION_SECTION_PARAM, section);
  return `/settings/connections?${params.toString()}`;
}

export const CONNECTIONS_REDIRECTS = {
  channels: { tab: "channels", section: "accounts" },
  "api-keys": { tab: "developers", section: "keys" },
  webhooks: { tab: "developers", section: "webhooks" },
  "webhook-deliveries": { tab: "developers", section: "deliveries" },
  "incoming-webhooks": { tab: "developers", section: "incoming" },
} as const satisfies Record<string, { tab: ConnectionTab; section: ConnectionSection }>;

export type ConnectionsRedirectSlug = keyof typeof CONNECTIONS_REDIRECTS;

export function connectionsRedirectHref(slug: ConnectionsRedirectSlug, search: URLSearchParams): string {
  const { tab, section } = CONNECTIONS_REDIRECTS[slug];
  const params = new URLSearchParams({ [CONNECTION_TAB_PARAM]: tab });
  if (section !== connectionSectionsOf(tab)[0]) params.set(CONNECTION_SECTION_PARAM, section);
  for (const [key, value] of search)
    if (key !== CONNECTION_TAB_PARAM && key !== CONNECTION_SECTION_PARAM) params.append(key, value);
  return `/settings/connections?${params.toString()}`;
}
