import type { MetadataRoute } from "next";
import type { LocalizedRoute } from "@/core/seo/sitemap";

import { env } from "@/env";
import { assembleSitemap } from "@/core/seo/sitemap";
import { hubPageCount, hubPageHref } from "@/core/seo/hub-pagination";
import { LANDING_HUBS } from "@/core/seo/landing-hubs";
import { CONTENT_LOCALES, stripLocalePrefix } from "@/i18n/locale-registry";
import { PUBLIC_ROUTES_SEO } from "@/i18n/routing";
import { ROUTE_SOURCE_MAP } from "@/core/fumadocs/route-source-map";

function getLastModified(lastModified: Date | number | undefined) {
  if (!lastModified) return undefined;
  const date = lastModified instanceof Date ? lastModified : new Date(lastModified);
  return isNaN(date.getTime()) ? undefined : date;
}

function collectLocalizedRoutes(): LocalizedRoute[] {
  const localizedRoutes: LocalizedRoute[] = [];

  for (const locale of CONTENT_LOCALES) {
    for (const route of PUBLIC_ROUTES_SEO) {
      const routeMapping = ROUTE_SOURCE_MAP[route];

      if (route.includes(":")) {
        for (const page of routeMapping.source.getPages(locale)) {
          if (!page.url) continue;
          localizedRoutes.push({
            locale,
            routePath: stripLocalePrefix(page.url),
            lastModified: getLastModified(page.data.lastModified),
          });
        }
        continue;
      }

      const page = routeMapping.source.getPage(routeMapping.path, locale);
      if (!page) continue;

      localizedRoutes.push({
        locale,
        routePath: route,
        lastModified: getLastModified(page.data.lastModified),
      });
    }

    for (const hub of LANDING_HUBS) {
      const source = ROUTE_SOURCE_MAP[hub.detailRoute].source;
      const pageCount = hubPageCount(source.getPages(locale).length);

      for (let page = 2; page <= pageCount; page++) {
        localizedRoutes.push({
          locale,
          routePath: hubPageHref(hub.hubPath, page),
        });
      }
    }
  }

  return localizedRoutes;
}

export default function sitemap(): MetadataRoute.Sitemap {
  return assembleSitemap(collectLocalizedRoutes(), env.BASE_URL, new Date());
}
