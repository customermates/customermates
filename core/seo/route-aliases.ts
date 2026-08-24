import { CONTENT_LOCALES, DEFAULT_LOCALE, buildLocalePath } from "../../i18n/locale-registry";

export const PERMANENT_ROUTE_ALIASES = {
  "/compare/monday-vs-hubspot": "/compare/hubspot-vs-monday",
  "/compare/pipedrive-vs-hubspot": "/compare/hubspot-vs-pipedrive",
  "/compare/zoho-vs-hubspot": "/compare/hubspot-vs-zoho",
  "/compare/salesforce-vs-pipedrive": "/compare/pipedrive-vs-salesforce",
  "/compare/salesforce-vs-zoho": "/compare/zoho-vs-salesforce",
} as const satisfies Record<string, string>;

export type RetiredRoutePath = keyof typeof PERMANENT_ROUTE_ALIASES;

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
