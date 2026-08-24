import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  SITEMAP_CODE_ROUTES,
  SITEMAP_CONTENT_ROUTES,
  SITEMAP_EXTRA_CONTENT_ROUTES,
  PUBLIC_ROUTES_SEO,
} from "@/i18n/routing";

const ROUTE_GROUPS = ["(static)", "(public)"] as const;

function pageFileFor(route: string): string {
  const segments = route === "/" ? [] : route.slice(1).split("/").map(toSegmentDirectory);

  for (const group of ROUTE_GROUPS) {
    const candidate = resolve(process.cwd(), "app/[locale]", group, ...segments, "page.tsx");
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(`No page file found for sitemap route ${route}`);
}

function toSegmentDirectory(segment: string): string {
  return segment.startsWith(":") ? `[${segment.slice(1)}]` : segment;
}

// /contact and 206 /docs/openapi/* URLs shipped a bare "Customermates" title with no canonical and no
// hreflang, because their route files declared no generateMetadata at all. Nothing failed: the pages
// rendered, returned 200, and silently self-competed. This asserts the declaration exists for every
// URL the sitemap submits.
describe("metadata coverage", () => {
  const submittedRoutes = [...SITEMAP_CONTENT_ROUTES, ...SITEMAP_EXTRA_CONTENT_ROUTES, ...SITEMAP_CODE_ROUTES];

  it("submits at least the routes this repository publishes", () => {
    expect(submittedRoutes.length, "the submitted set should not be empty").toBeGreaterThan(20);
  });

  it.each(submittedRoutes)("declares generateMetadata for %s", (route) => {
    const source = readFileSync(pageFileFor(route), "utf8");
    expect(source, `${route} would ship with no canonical`).toContain("export async function generateMetadata");
  });

  it("declares generateMetadata for every noindex route too", () => {
    // A noindex page still needs a self-canonical, and it needs the noindex to actually be emitted.
    const noindexRoutes = PUBLIC_ROUTES_SEO.filter((route) => !submittedRoutes.includes(route));
    expect(noindexRoutes.length, "the auth routes should be withheld from the sitemap").toBeGreaterThan(0);
    for (const route of noindexRoutes) {
      const source = readFileSync(pageFileFor(route), "utf8");
      expect(source, `${route} declares no metadata`).toContain("export async function generateMetadata");
    }
  });

  it("keeps the raw markdown mirror out of the index", () => {
    // /raw/{source}/{slug}.md serves the same text as the docs HTML. It has no <head>, so a meta tag
    // cannot carry the noindex; only the response header can.
    const source = readFileSync(
      resolve(process.cwd(), "app/[locale]/(public)/raw/[source]/[slug].md/route.ts"),
      "utf8",
    );
    expect(source, "the markdown mirror would duplicate every docs page").toContain("X-Robots-Tag");
  });
});
