import type { NextRequest } from "next/server";

import { defineRouting } from "next-intl/routing";

import { APP_LOCALES, CONTENT_LOCALES, DEFAULT_LOCALE, ROUTING_LOCALES } from "./locale-registry";
import { CONTENT_LOCALE_COOKIE_NAME, LOCALE_COOKIE_MAX_AGE } from "./locale-preference";

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

export const PUBLIC_ROUTES = [
  ...PUBLIC_ROUTES_SEO,
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

export const CONTENT_ROUTES = [
  ...PUBLIC_ROUTES_SEO.filter((route) => !route.startsWith("/auth/")),
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
  localeCookie: {
    name: CONTENT_LOCALE_COOKIE_NAME,
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
  },
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildLocaleAwareRegex(pathWithLeadingSlash: string): RegExp {
  const localePrefix = `(/(${ROUTING_LOCALES.map(escapeRegExp).join("|")}))?`;

  if (pathWithLeadingSlash === "/") return new RegExp(`^${localePrefix}/?$`);

  const escaped = escapeRegExp(pathWithLeadingSlash).replace(/:(\w+)/g, "([^/]+)");

  return new RegExp(`^${localePrefix}${escaped}/?$`, "i");
}
