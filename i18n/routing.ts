import type { NextRequest } from "next/server";

import { defineRouting } from "next-intl/routing";

export const ROUTING_LOCALES = ["en", "de"] as const;

export const ROUTING_DEFAULT_LOCALE = "en";

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
  "/blog",
  "/blog/:slug",
  "/features",
  "/pricing",
  "/n8n-crm",
  "/compare/:competitor",
  "/for/:industry",
  "/features/:slug",
  "/affiliate",
  "/docs",
  "/docs/:slug",
] as const;

export const PUBLIC_ROUTES = [
  ...PUBLIC_ROUTES_SEO,
  "/auth/pending",
  "/auth/error",
  "/auth/verify-email",
  "/invitation/:token",
  "/docs/skills/:slug",
  "/docs/openapi/:slug",
  "/docs/openapi",
  "/docs/skills",
] as const;

export const routing = defineRouting({
  locales: ROUTING_LOCALES,
  defaultLocale: ROUTING_DEFAULT_LOCALE,
  localePrefix: "always",
});

export type RouterLocale = (typeof routing.locales)[number];

export function isPublicPage(req: NextRequest) {
  const { pathname } = req.nextUrl;

  for (const p of PUBLIC_ROUTES) if (buildLocaleAwareRegex(p).test(pathname)) return true;

  return false;
}

function buildLocaleAwareRegex(pathWithLeadingSlash: string): RegExp {
  if (pathWithLeadingSlash === "/") return new RegExp(`^(/(${ROUTING_LOCALES.join("|")}))?/?$`, "i");

  const escaped = pathWithLeadingSlash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:(\w+)/g, "([^/]+)");

  return new RegExp(`^(/(${ROUTING_LOCALES.join("|")}))?${escaped}/?$`, "i");
}
