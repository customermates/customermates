import type { MetadataRoute } from "next";
import type { LocalizedRoute } from "@/core/seo/sitemap";

import { env } from "@/env";
import { assembleSitemap } from "@/core/seo/sitemap";
import { hubPageCountForSource, hubPageHref } from "@/core/seo/hub-pagination";
import { LANDING_HUBS } from "@/core/seo/landing-hubs";
import { isRetiredRoutePath } from "@/core/seo/route-aliases";
import { CONTENT_LOCALES, stripLocalePrefix } from "@/i18n/locale-registry";
import { SITEMAP_CONTENT_ROUTES, SITEMAP_EXTRA_CONTENT_ROUTES } from "@/i18n/routing";
import { ROUTE_SOURCE_MAP } from "@/core/fumadocs/route-source-map";

type DatedPage = { blogPost?: { date?: string } };

function declaredLastModified(data: object): Date | undefined {
  const declared = (data as DatedPage).blogPost?.date;
  if (!declared) return undefined;

  const date = new Date(declared);
  return isNaN(date.getTime()) ? undefined : date;
}

function collectLocalizedRoutes(): LocalizedRoute[] {
  const localizedRoutes: LocalizedRoute[] = [];
  const emitted = new Set<string>();

  const push = (route: LocalizedRoute) => {
    const key = `${route.locale}:${route.routePath}`;
    if (emitted.has(key)) return;
    emitted.add(key);
    localizedRoutes.push(route);
  };

  for (const locale of CONTENT_LOCALES) {
    for (const route of SITEMAP_CONTENT_ROUTES) {
      const routeMapping = ROUTE_SOURCE_MAP[route];

      if (route.includes(":")) {
        for (const page of routeMapping.source.getPages(locale)) {
          if (!page.url) continue;
          const routePath = stripLocalePrefix(page.url);
          if (isRetiredRoutePath(routePath)) continue;
          push({
            locale,
            routePath,
            lastModified: declaredLastModified(page.data),
          });
        }
        continue;
      }

      if (isRetiredRoutePath(route)) continue;

      const page = routeMapping.source.getPage(routeMapping.path, locale);
      if (!page) continue;

      push({
        locale,
        routePath: route,
        lastModified: declaredLastModified(page.data),
      });
    }

    for (const route of SITEMAP_EXTRA_CONTENT_ROUTES) {
      const routeMapping = ROUTE_SOURCE_MAP[route];
      const page = routeMapping.source.getPage(routeMapping.path, locale);
      if (!page) continue;

      push({
        locale,
        routePath: route,
        lastModified: declaredLastModified(page.data),
      });
    }

    for (const hub of LANDING_HUBS) {
      const source = ROUTE_SOURCE_MAP[hub.detailRoute].source;
      const pageCount = hubPageCountForSource(source);

      for (let page = 2; page <= pageCount; page++) {
        push({
          locale,
          routePath: hubPageHref(hub.hubPath, page),
        });
      }
    }
  }

  return localizedRoutes;
}

export default function sitemap(): MetadataRoute.Sitemap {
  return assembleSitemap(collectLocalizedRoutes(), env.BASE_URL);
}
