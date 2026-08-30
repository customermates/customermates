import { CONTENT_LOCALES, DEFAULT_LOCALE, buildLocalePath } from "../../i18n/locale-registry";

const RETIRED_ROUTE_ALIASES = {
  "/blog/ai-native-crm": "/blog/agentic-crm",
  "/compare/monday-vs-hubspot": "/compare/hubspot-vs-monday",
  "/compare/pipedrive-vs-hubspot": "/compare/hubspot-vs-pipedrive",
  "/compare/zoho-vs-hubspot": "/compare/hubspot-vs-zoho",
  "/compare/salesforce-vs-pipedrive": "/compare/pipedrive-vs-salesforce",
  "/compare/salesforce-vs-zoho": "/compare/zoho-vs-salesforce",

  "/docs/account-settings": "/docs/app-profile",
  "/docs/company-settings": "/docs/app-company",
  "/docs/comparison": "/compare",
  "/docs/feature-guide-custom-columns": "/docs/app-records",
  "/docs/feature-guide-dashboard-widgets": "/docs/app-dashboard",
  "/docs/feature-guide-entities-relationships": "/docs/concepts",
  "/docs/feature-guide-webhooks-events": "/docs/webhooks",
  "/docs/features-audit-logging": "/docs/app-company",
  "/docs/features-custom-columns": "/docs/app-records",
  "/docs/features-permissions-roles": "/docs/app-company",
  "/docs/features-report-statistics": "/docs/app-dashboard",
  "/docs/features-table-kanban-view": "/docs/app-records",
  "/docs/features-webhooks-events": "/docs/webhooks",
  "/docs/from-pipedrive": "/compare/pipedrive-alternative",
  "/docs/integrations-intro": "/docs/mcp",
  "/docs/managing-your-installation": "/docs/self-hosting",
  "/docs/mcp-connect-chatgpt": "/docs/connect-custom-connector",
  "/docs/mcp-connect-claude": "/docs/connect-custom-connector",
  "/docs/mcp-connect-claude-code": "/docs/connect-cli",
  "/docs/mcp-connect-claude-desktop": "/docs/connect-custom-connector",
  "/docs/mcp-connect-codex": "/docs/connect-cli",
  "/docs/mcp-connect-cursor": "/docs/connect-cli",
  "/docs/mcp-connect-gemini": "/docs/connect-cli",
  "/docs/mcp-tool-catalog": "/docs/mcp",
  "/docs/concepts/mcp": "/docs/mcp",
  "/docs/openclaw-and-ai-agents": "/docs/mcp",
  "/docs/roles-permissions": "/docs/app-company",
  "/docs/self-host-vs-cloud": "/docs/self-hosting",
  "/docs/setup-ai-assistant": "/docs/connect-custom-connector",
  "/docs/webhook-events": "/docs/webhooks",
} as const satisfies Record<string, string>;

const DUPLICATE_ROUTE_ALIASES = {
  "/docs/intro-page": "/docs",
} as const satisfies Record<string, string>;

export const PERMANENT_ROUTE_ALIASES = {
  ...RETIRED_ROUTE_ALIASES,
  ...DUPLICATE_ROUTE_ALIASES,
} as const satisfies Record<string, string>;

export type DeletedRoutePath = keyof typeof RETIRED_ROUTE_ALIASES;

export type DuplicateRoutePath = keyof typeof DUPLICATE_ROUTE_ALIASES;

export type RetiredRoutePath = keyof typeof PERMANENT_ROUTE_ALIASES;

export const DELETED_ROUTE_PATHS = Object.keys(RETIRED_ROUTE_ALIASES) as DeletedRoutePath[];

export const DUPLICATE_ROUTE_PATHS = Object.keys(DUPLICATE_ROUTE_ALIASES) as DuplicateRoutePath[];

export const RETIRED_ROUTE_PATHS = Object.keys(PERMANENT_ROUTE_ALIASES) as RetiredRoutePath[];

export function isRetiredRoutePath(routePath: string): routePath is RetiredRoutePath {
  return routePath in PERMANENT_ROUTE_ALIASES;
}

export type PermanentRedirect = {
  source: string;
  destination: string;
  permanent: true;
};

export function permanentAliasRedirects(): PermanentRedirect[] {
  return Object.entries(PERMANENT_ROUTE_ALIASES).flatMap(([retired, survivor]) => [
    ...CONTENT_LOCALES.map((locale) => ({
      source: buildLocalePath(locale, retired),
      destination: buildLocalePath(locale, survivor),
      permanent: true as const,
    })),
    {
      source: retired,
      destination: buildLocalePath(DEFAULT_LOCALE, survivor),
      permanent: true as const,
    },
  ]);
}
