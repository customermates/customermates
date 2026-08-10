import type { Metadata } from "next";
import type { ROUTE_SOURCE_MAP } from "./route-source-map";

import { getSourceFromRoute } from "./route-source-map";

import { env } from "@/env";
import { buildAlternateLanguages, buildLocalePath } from "@/core/seo/alternates";
import { CONTENT_LOCALES } from "@/i18n/locale-registry";

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
  const page = source.getPage(path, locale);

  if (!page) return {};

  const title = page.data.title?.trim() || "";
  const description = page.data.description?.trim() || "";

  if (!title) return {};

  const routePath = buildRoutePath(route, params);
  const translatedLocales = CONTENT_LOCALES.filter((loc) => source.getPage(path, loc) !== undefined);
  const alternates = buildAlternateLanguages(routePath, translatedLocales, env.BASE_URL);

  const canonical = `${env.BASE_URL}${buildLocalePath(locale, routePath)}`;
  const ogImageParams = new URLSearchParams({ title });

  if (description) ogImageParams.set("description", description);

  const image = {
    alt: title,
    height: 630,
    url: `/og/image.png?${ogImageParams.toString()}`,
    width: 1200,
  };

  const metadata: Metadata = {
    alternates: alternates ? { canonical, languages: alternates } : { canonical },
    openGraph: {
      description,
      images: [image],
      title,
      type,
    },
    twitter: {
      card: "summary_large_image",
      description,
      images: [image],
      title,
    },
    title,
  };

  if (description) metadata.description = description;

  return metadata;
}

function buildRoutePath(route: string, params: Record<string, string>): string {
  if (Object.keys(params).length === 0) return route;

  let path = route;
  for (const [key, value] of Object.entries(params)) if (value) path = path.replace(`:${key}`, value);

  return path;
}
