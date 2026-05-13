import type { MetadataRoute } from "next";

import { env } from "@/env";
import { PUBLIC_ROUTES_SEO, ROUTING_DEFAULT_LOCALE, ROUTING_LOCALES } from "@/i18n/routing";
import { ROUTE_SOURCE_MAP } from "@/core/fumadocs/route-source-map";

function getLastModified(lastModified: Date | number | undefined) {
  if (!lastModified) return undefined;
  const date = lastModified instanceof Date ? lastModified : new Date(lastModified);
  return isNaN(date.getTime()) ? undefined : date;
}

function generateRoutes() {
  const routes: Array<{ route: string; lastModified?: Date }> = [];

  for (const locale of ROUTING_LOCALES) {
    for (const route of PUBLIC_ROUTES_SEO) {
      const routeMapping = ROUTE_SOURCE_MAP[route];

      if (route.includes(":")) {
        if (routeMapping) {
          const pages = routeMapping.source.getPages(locale);

          for (const page of pages) {
            const url = page.url;
            if (url) {
              const lastModified = getLastModified(page.data.lastModified);

              routes.push({
                route: url,
                lastModified,
              });
            }
          }
        }
      } else {
        const lastModified = routeMapping
          ? getLastModified(routeMapping.source.getPage(routeMapping.path, locale)?.data.lastModified)
          : undefined;

        const localeRoute = route === "/" ? `/${locale}` : `/${locale}${route}`;

        routes.push({
          route: localeRoute,
          lastModified,
        });
      }
    }
  }

  return routes;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const allRoutes = generateRoutes();

  return allRoutes.map((routeData) => {
    const { route, lastModified } = routeData;
    const isOpenApiRoute = /^\/[^/]+\/docs\/openapi(\/|$)/.test(route);
    // Keep sitemap alternates aligned with page-level canonicalization for OpenAPI URLs.
    const languages = isOpenApiRoute
      ? { [ROUTING_DEFAULT_LOCALE]: `${env.BASE_URL}${route}` }
      : Object.fromEntries(
          ROUTING_LOCALES.map((locale) => {
            const path = route.replace(/^\/[^/]+/, `/${locale}`);
            return [locale, `${env.BASE_URL}${path}`];
          }),
        );

    return {
      url: `${env.BASE_URL}${route}`,
      lastModified: lastModified ?? new Date(),
      alternates: {
        languages,
      },
    };
  });
}
