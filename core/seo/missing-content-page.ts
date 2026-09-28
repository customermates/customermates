import { HUB_PAGE_SEGMENT, hubPageCount, resolveHubPageSegment } from "./hub-pagination";

import { DEFAULT_LOCALE } from "@/i18n/locale-registry";

export type ContentSlugCollection = "api" | "blog-posts" | "compare-pages" | "docs" | "feature-pages" | "for-pages";

export type ContentSlugManifest = Record<ContentSlugCollection, Record<string, readonly string[]>>;

const DETAIL_ROUTES: readonly { base: string; collection: ContentSlugCollection; reserved: readonly string[] }[] = [
  { base: "/blog", collection: "blog-posts", reserved: [] },
  { base: "/compare", collection: "compare-pages", reserved: [] },
  { base: "/for", collection: "for-pages", reserved: [] },
  { base: "/features", collection: "feature-pages", reserved: ["all"] },
  { base: "/docs", collection: "docs", reserved: ["openapi"] },
  { base: "/docs/openapi", collection: "api", reserved: [] },
];

const HUB_ROUTES: readonly { base: string; collection: ContentSlugCollection }[] = [
  { base: "/blog", collection: "blog-posts" },
  { base: "/compare", collection: "compare-pages" },
  { base: "/for", collection: "for-pages" },
  { base: "/features/all", collection: "feature-pages" },
];

function childSegment(path: string, base: string): string | null {
  if (!path.startsWith(`${base}/`)) return null;
  const rest = path.slice(base.length + 1);
  return rest && !rest.includes("/") ? rest : null;
}

export function isMissingContentPage(unprefixedPath: string, locale: string, manifest: ContentSlugManifest): boolean {
  const path = unprefixedPath.replace(/\/$/u, "");

  for (const { base, collection } of HUB_ROUTES) {
    const page = childSegment(path, `${base}/${HUB_PAGE_SEGMENT}`);
    if (page === null) continue;

    const pageCount = hubPageCount(manifest[collection][DEFAULT_LOCALE]?.length ?? 0);
    return resolveHubPageSegment(page, pageCount).kind === "not-found";
  }

  for (const { base, collection, reserved } of DETAIL_ROUTES) {
    const slug = childSegment(path, base);
    if (slug === null || reserved.includes(slug)) continue;

    return !(manifest[collection][locale] ?? []).includes(slug);
  }

  return false;
}
