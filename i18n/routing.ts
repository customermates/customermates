import type { NextRequest } from "next/server";

import { defineRouting } from "next-intl/routing";

import { APP_LOCALES, CONTENT_LOCALES, DEFAULT_LOCALE, ROUTING_LOCALES } from "./locale-registry";

export const NOINDEX_PUBLIC_ROUTES = [
  "/auth/signin",
  "/auth/signup",
  "/auth/forgot-password",
  "/auth/reset-password",
] as const;

export const PUBLIC_ROUTES_SEO = [
  "/",
  "/auth/signin",
  "/auth/signup",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/help-and-feedback",
  "/imprint",
  "/privacy",
  "/terms",
  "/subprocessors",
  "/dpa",
  "/blog",
  "/blog/:slug",
  "/features",
  "/features/all",
  "/pricing",
  "/n8n-crm",
  "/compare",
  "/compare/:competitor",
  "/for",
  "/for/:industry",
  "/features/:slug",
  "/affiliate",
  "/docs",
  "/docs/:slug",
] as const;

export type PublicSeoRoute = (typeof PUBLIC_ROUTES_SEO)[number];

const NOINDEX_ROUTE_SET: ReadonlySet<string> = new Set<string>([...NOINDEX_PUBLIC_ROUTES, "/docs/openapi/:slug"]);

export function isNoindexPublicRoute(route: string): boolean {
  return NOINDEX_ROUTE_SET.has(route);
}

export const SITEMAP_CONTENT_ROUTES: readonly PublicSeoRoute[] = PUBLIC_ROUTES_SEO.filter(
  (route): route is PublicSeoRoute => !NOINDEX_ROUTE_SET.has(route),
);

export const SITEMAP_EXTRA_CONTENT_ROUTES = ["/contact", "/docs/openapi"] as const;

export const HUB_PAGE_ROUTES = [
  "/blog/page/:page",
  "/compare/page/:page",
  "/features/all/page/:page",
  "/for/page/:page",
] as const;

export const PUBLIC_ROUTES = [
  ...PUBLIC_ROUTES_SEO,
  ...HUB_PAGE_ROUTES,
  "/contact",
  "/styleguide",
  "/styleguide/foundations",
  "/styleguide/patterns",
  "/styleguide/visuals",
  "/auth/pending",
  "/auth/error",
  "/auth/verify-email",
  "/auth/invitation",
  "/invitation/:token",
  "/docs/openapi/:slug",
  "/docs/openapi",
] as const;

export const PROTECTED_ROUTES = [
  "/auth/mcp-consent",
  "/company/audit-logs",
  "/company/members",
  "/company/roles",
  "/company/settings",
  "/company/subscription",
  "/company/webhook-deliveries",
  "/company/webhooks",
  "/contacts",
  "/contacts/:id",
  "/dashboard",
  "/deals",
  "/deals/:id",
  "/inbox",
  "/legal-update",
  "/onboarding",
  "/onboarding/join",
  "/onboarding/wizard",
  "/operator/audit",
  "/operator/overview",
  "/operator/users",
  "/operator/workspaces",
  "/organizations",
  "/organizations/:id",
  "/profile/api-keys",
  "/profile/connected-accounts",
  "/profile/settings",
  "/routines",
  "/services",
  "/services/:id",
  "/subscription-expired",
  "/tasks",
  "/tasks/:id",
  "/test/error",
  "/test/overlays",
] as const;

export const CONTENT_ROUTES = [
  ...PUBLIC_ROUTES_SEO.filter((route) => !route.startsWith("/auth/")),
  ...HUB_PAGE_ROUTES,
  "/docs/openapi/:slug",
  "/docs/openapi",
] as const;

export const routing = defineRouting({
  locales: ROUTING_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
  localeCookie: false,
  alternateLinks: false,
});

export const appRouting = defineRouting({
  locales: APP_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
  localeCookie: false,
  alternateLinks: false,
});

export const contentRouting = defineRouting({
  locales: CONTENT_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
  localeCookie: false,
  alternateLinks: false,
});

export function isPublicPage(req: NextRequest) {
  return isPublicPathname(req.nextUrl.pathname);
}

export function isPublicPathname(pathname: string) {
  for (const p of PUBLIC_ROUTES) if (buildLocaleAwareRegex(p).test(pathname)) return true;

  return false;
}

export function isContentPage(req: NextRequest) {
  return isContentPathname(req.nextUrl.pathname);
}

export function isContentPathname(pathname: string) {
  for (const p of CONTENT_ROUTES) if (buildLocaleAwareRegex(p).test(pathname)) return true;

  return false;
}

export function isProtectedPage(req: NextRequest) {
  return isProtectedPathname(req.nextUrl.pathname);
}

export function isProtectedPathname(pathname: string) {
  const decoded = decodePathname(pathname);
  if (decoded === null) return true;

  for (const p of PROTECTED_ROUTES) if (buildLocaleAwareRegex(p).test(decoded)) return true;

  return false;
}

function decodePathname(pathname: string): string | null {
  try {
    return pathname.split("/").map(decodeURIComponent).join("/");
  } catch {
    return null;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildLocaleAwareRegex(pathWithLeadingSlash: string): RegExp {
  const localePrefix = `(/(${ROUTING_LOCALES.map(escapeRegExp).join("|")}))?`;

  if (pathWithLeadingSlash === "/") return new RegExp(`^${localePrefix}/?$`);

  const escaped = escapeRegExp(pathWithLeadingSlash).replace(/:(\w+)/g, "([^/]+)");

  return new RegExp(`^${localePrefix}${escaped}/?$`, "i");
}
