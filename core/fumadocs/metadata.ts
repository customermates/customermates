import type { Metadata } from "next";
import type { ROUTE_SOURCE_MAP } from "./route-source-map";

import { getSourceFromRoute } from "./route-source-map";

import { BASE_URL } from "@/constants/env";
import { ROUTING_DEFAULT_LOCALE, ROUTING_LOCALES } from "@/i18n/routing";

type GenerateMetadataParams = {
  locale: string;
  route: keyof typeof ROUTE_SOURCE_MAP;
  params?: Record<string, string>;
  type?: "article" | "website";
};
export function generateMetadataFromMeta({
  locale,
  route,
  params = {},
  type = "website",
}: GenerateMetadataParams): Metadata {
  const routeMapping = getSourceFromRoute(route, params);

  if (!routeMapping) return {};

  const { source, path } = routeMapping;
  // OpenAPI operation docs are generated from EN-only summaries/descriptions.
  // Keep locale routes for UX, but consolidate SEO metadata to the default locale.
  const isOpenApiSlugRoute = route === "/docs/openapi/:slug";
  const metadataLocale = isOpenApiSlugRoute ? ROUTING_DEFAULT_LOCALE : locale;
  const page = source.getPage(path, metadataLocale);

  if (!page) return {};

  const title = page.data.title?.trim() || "";
  const description = page.data.description?.trim() || "";

  if (!title) return {};

  const routePath = buildRoutePath(route, params);
  const alternates: Record<string, string> = {};
  const localesForAlternates = isOpenApiSlugRoute ? [ROUTING_DEFAULT_LOCALE] : ROUTING_LOCALES;

  for (const loc of localesForAlternates) {
    const localeRoute = routePath === "/" ? `/${loc}` : `/${loc}${routePath}`;
    alternates[loc] = `${BASE_URL}${localeRoute}`;
  }

  const xDefaultLocaleRoute =
    routePath === "/" ? `/${ROUTING_DEFAULT_LOCALE}` : `/${ROUTING_DEFAULT_LOCALE}${routePath}`;
  alternates["x-default"] = `${BASE_URL}${xDefaultLocaleRoute}`;

  const canonicalRoute = routePath === "/" ? `/${metadataLocale}` : `/${metadataLocale}${routePath}`;
  const canonical = `${BASE_URL}${canonicalRoute}`;

  const metadata: Metadata = {
    alternates:
      Object.keys(alternates).length > 0
        ? {
            canonical,
            languages: alternates,
          }
        : { canonical },
    openGraph: {
      title,
      type,
    },
    title,
  };

  if (description) {
    metadata.description = description;
    metadata.openGraph = {
      ...metadata.openGraph,
      description,
    };
  }

  if (isOpenApiSlugRoute && locale !== ROUTING_DEFAULT_LOCALE) {
    metadata.robots = {
      follow: true,
      index: false,
    };
  }

  return metadata;
}

function buildRoutePath(route: string, params: Record<string, string>): string {
  if (Object.keys(params).length === 0) return route;

  let path = route;
  for (const [key, value] of Object.entries(params)) if (value) path = path.replace(`:${key}`, value);

  return path;
}
