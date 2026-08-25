import type { LucideIcon } from "lucide-react";

import {
  BookOpen,
  Building,
  Cable,
  Database,
  FileJson,
  Gauge,
  Inbox,
  Key,
  LayoutGrid,
  LibraryBig,
  ListFilter,
  PlugZap,
  Rocket,
  Server,
  Shield,
  SquareTerminal,
  UserCircle,
  Webhook,
  Workflow,
} from "lucide-react";

export type DocNavItem = {
  slug: string;
  i18nKey: string;
  icon: LucideIcon;
};

export type DocNavGroup = {
  key: string;
  labelEn: string;
  i18nKey: string;
  items: DocNavItem[];
};

export const DOC_NAV_GROUPS: DocNavGroup[] = [
  {
    key: "introduction",
    labelEn: "Introduction",
    i18nKey: "DocsSidebar.introduction",
    items: [{ slug: "", i18nKey: "DocsSidebar.introduction", icon: BookOpen }],
  },
  {
    key: "getting-started",
    labelEn: "Getting started",
    i18nKey: "DocsSidebar.gettingStarted",
    items: [
      { slug: "quickstart", i18nKey: "DocsSidebar.quickstart", icon: Rocket },
      { slug: "concepts", i18nKey: "DocsSidebar.concepts", icon: LibraryBig },
    ],
  },
  {
    key: "connect-your-ai",
    labelEn: "Connect your AI",
    i18nKey: "DocsSidebar.connectYourAi",
    items: [
      { slug: "connect-custom-connector", i18nKey: "DocsSidebar.connectConnector", icon: PlugZap },
      { slug: "connect-cli", i18nKey: "DocsSidebar.connectCli", icon: SquareTerminal },
      { slug: "messaging-rate-limits", i18nKey: "DocsSidebar.messagingRateLimits", icon: Gauge },
    ],
  },
  {
    key: "integrations",
    labelEn: "Integrations",
    i18nKey: "DocsSidebar.integrations",
    items: [
      { slug: "mcp", i18nKey: "DocsSidebar.mcp", icon: Cable },
      { slug: "webhooks", i18nKey: "DocsSidebar.webhooks", icon: Webhook },
      { slug: "openapi", i18nKey: "DocsSidebar.openapi", icon: FileJson },
      { slug: "n8n", i18nKey: "DocsSidebar.n8n", icon: Workflow },
    ],
  },
  {
    key: "self-hosting",
    labelEn: "Self-hosting",
    i18nKey: "DocsSidebar.selfHosting",
    items: [
      { slug: "self-hosting", i18nKey: "DocsSidebar.getStarted", icon: Server },
      { slug: "architecture-security", i18nKey: "DocsSidebar.architectureSecurity", icon: Shield },
    ],
  },
  {
    key: "app-guide",
    labelEn: "App guide",
    i18nKey: "DocsSidebar.appGuide",
    items: [
      { slug: "app-dashboard", i18nKey: "DocsSidebar.appDashboard", icon: LayoutGrid },
      { slug: "app-inbox", i18nKey: "DocsSidebar.appInbox", icon: Inbox },
      { slug: "app-records", i18nKey: "DocsSidebar.appRecords", icon: Database },
      { slug: "app-profile", i18nKey: "DocsSidebar.appProfile", icon: UserCircle },
      { slug: "app-company", i18nKey: "DocsSidebar.appCompany", icon: Building },
      { slug: "api-keys", i18nKey: "DocsSidebar.apiKeys", icon: Key },
      { slug: "filter-syntax", i18nKey: "DocsSidebar.filterSyntax", icon: ListFilter },
    ],
  },
];

export function docNavI18nKey(slug: string): string | null {
  for (const group of DOC_NAV_GROUPS) for (const item of group.items) if (item.slug === slug) return item.i18nKey;

  return null;
}
