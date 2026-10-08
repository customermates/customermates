import { CONTENT_LOCALES, DEFAULT_LOCALE, buildLocalePath } from "../../i18n/locale-registry";

const RETIRED_ROUTE_ALIASES = {
  "/blog/ai-native-crm": "/blog/ai-crm",
  "/blog/crm-system": "/blog/crm-systems",
  "/blog/ai-bdr": "/blog/ai-sales-agent",
  "/blog/ai-sdr": "/blog/ai-sales-agent",
  "/blog/automated-crm": "/features/workflow-automation",
  "/blog/build-your-own-crm": "/blog/customizable-crm",
  "/blog/chatgpt-summarize-notes": "/blog/chatgpt-for-sales",
  "/blog/copilot-crm": "/blog/copilot-for-sales",
  "/blog/crm-advantages": "/blog/what-is-crm",
  "/blog/crm-benefits": "/blog/what-is-crm",
  "/blog/crm-best-practices": "/blog/crm-strategy",
  "/blog/crm-consulting": "/blog/crm-implementation",
  "/blog/crm-roi": "/blog/crm-cost",
  "/blog/crm-software": "/blog/what-is-crm",
  "/blog/customer-communication-management": "/blog/customer-interaction-management",
  "/blog/customer-retention-management": "/blog/crm-strategy",
  "/blog/customer-success-management": "/blog/crm-strategy",
  "/blog/erp-vs-crm": "/blog/crm-and-erp",
  "/blog/lead-qualification-chatgpt": "/blog/client-qualification",
  "/blog/lexoffice-alternative": "/blog/crm-and-erp",
  "/blog/operational-crm": "/blog/crm-systems",
  "/blog/recruiting-crm": "/for/recruiting",
  "/blog/sales-crm": "/blog/crm-for-sales",
  "/blog/sales-tracking-spreadsheet": "/blog/excel-crm-template",
  "/blog/salesforce-einstein": "/blog/agentforce",
  "/blog/smart-crm": "/blog/ai-crm",
  "/blog/spreadsheet-crm": "/blog/excel-crm-template",
  "/blog/white-label-crm": "/blog/open-source-crm",
  "/compare/gohighlevel": "/compare/gohighlevel-alternative",
  "/features/account-management": "/features/contact-management",
  "/features/crm-integration": "/features/integrations",
  "/features/customer-service": "/features/unified-inbox",
  "/features/email-integration": "/features/unified-inbox",
  "/features/lead-tracking": "/features/lead-management",
  "/features/project-management": "/features/task-management",
  "/features/sales-automation": "/features/workflow-automation",
  "/features/sales-tracking": "/features/sales",
  "/features/slack-integration": "/features/integrations",
  "/for/auto-repair": "/for/tradespeople",
  "/for/b2b": "/for/smb",
  "/for/cleaning-companies": "/for/tradespeople",
  "/for/construction": "/for/tradespeople",
  "/for/contractors": "/for/tradespeople",
  "/for/ecommerce": "/for",
  "/for/electricians": "/for/tradespeople",
  "/for/field-service": "/for/tradespeople",
  "/for/healthcare": "/for",
  "/for/hvac": "/for/tradespeople",
  "/for/insurance-companies": "/for/insurance-agents",
  "/for/lawyers": "/for/law-firms",
  "/for/logistics": "/for",
  "/for/manufacturing": "/for",
  "/for/marketing": "/for/smb",
  "/for/marketing-agencies": "/for/agencies",
  "/for/mid-market": "/for/smb",
  "/for/mortgage-brokers": "/for/financial-advisors",
  "/for/plumbers": "/for/tradespeople",
  "/for/property-management": "/for/real-estate",
  "/for/realtors": "/for/real-estate",
  "/for/restaurants": "/for",
  "/for/solar-companies": "/for/tradespeople",
  "/for/solopreneurs": "/for/freelancers",
  "/for/therapists": "/for",
  "/for/travel-agents": "/for",
  "/compare/monday-vs-hubspot": "/compare/hubspot-vs-monday",
  "/compare/pipedrive-vs-hubspot": "/compare/hubspot-vs-pipedrive",
  "/compare/zoho-vs-hubspot": "/compare/hubspot-vs-zoho",
  "/compare/salesforce-vs-pipedrive": "/compare/pipedrive-vs-salesforce",
  "/compare/salesforce-vs-zoho": "/compare/zoho-vs-salesforce",

  "/compare/cobra": "/compare/cobra-alternative",
  "/compare/freshsales": "/compare/freshsales-alternative",
  "/compare/hubspot": "/compare/hubspot-alternative",
  "/compare/microsoft-dynamics": "/compare/microsoft-dynamics-alternative",
  "/compare/monday": "/compare/monday-alternative",
  "/compare/notion": "/compare/notion-alternative",
  "/compare/pipedrive": "/compare/pipedrive-alternative",
  "/compare/salesflare": "/compare/salesflare-alternative",
  "/compare/salesforce": "/compare/salesforce-alternative",
  "/compare/salesmate": "/compare/salesmate-alternative",
  "/compare/vtiger": "/compare/vtiger-alternative",
  "/compare/weclapp": "/compare/weclapp-alternative",
  "/compare/zoho-crm": "/compare/zoho-crm-alternative",

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
