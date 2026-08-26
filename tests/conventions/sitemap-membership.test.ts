import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { PERMANENT_ROUTE_ALIASES } from "@/core/seo/route-aliases";
import {
  NOINDEX_PUBLIC_ROUTES,
  PUBLIC_ROUTES_SEO,
  SITEMAP_CONTENT_ROUTES,
  isNoindexPublicRoute,
} from "@/i18n/routing";

// These assertions are deliberately stated as properties of the submitted set rather than in terms
// of NOINDEX_PUBLIC_ROUTES. Deriving the expectation from the same list the implementation filters
// on produces a test that passes no matter what that list contains, which is worth nothing.
describe("sitemap membership", () => {
  it("submits no authentication URL", () => {
    // Eight auth URLs sat in the sitemap with no noindex. /en/auth/signup was "Crawled - currently
    // not indexed" and listed sitemap.xml among its own referring URLs, so the sitemap was the only
    // reason Google looked at it at all.
    const submittedAuthRoutes = SITEMAP_CONTENT_ROUTES.filter((route) => route.startsWith("/auth/"));
    expect(submittedAuthRoutes, "authentication URLs must never be submitted").toEqual([]);
  });

  it("marks every authentication route noindex", () => {
    const authRoutes = PUBLIC_ROUTES_SEO.filter((route) => route.startsWith("/auth/"));
    expect(authRoutes.length, "the auth routes should still exist to be excluded").toBeGreaterThan(0);
    for (const route of authRoutes) {
      expect(isNoindexPublicRoute(route), `${route} is submitted-adjacent and must carry noindex`).toBe(true);
    }
  });

  it("keeps every noindex route a real declared route", () => {
    // A typo here would silently exclude nothing, because the filter would match no route.
    for (const route of NOINDEX_PUBLIC_ROUTES) {
      expect(PUBLIC_ROUTES_SEO, `${route} is not a declared SEO route`).toContain(route);
    }
  });

  it("withholds nothing beyond the authentication routes", () => {
    // The sitemap losing a content route is as much a defect as it gaining an auth route.
    const withheld = PUBLIC_ROUTES_SEO.filter((route) => !SITEMAP_CONTENT_ROUTES.includes(route));
    expect(withheld.every((route) => route.startsWith("/auth/")), `withheld: ${withheld.join(", ")}`).toBe(true);
  });

  it("never submits a route that only redirects", () => {
    // A retired URL in the sitemap asks Google to crawl a 308, wasting the crawl budget the
    // consolidation was meant to reclaim.
    const retired = new Set<string>(Object.keys(PERMANENT_ROUTE_ALIASES));
    for (const route of SITEMAP_CONTENT_ROUTES) {
      expect(retired.has(route), `${route} is retired and must not be submitted`).toBe(false);
    }
  });

  it("does not also disallow the routes it is trying to de-index", () => {
    // A page must stay crawlable for Google to read its noindex. Two auth URLs are currently
    // "Submitted and indexed", so a robots Disallow on /auth/ would freeze them in the index by
    // preventing the crawl that would discover the noindex. Disallow and noindex are alternatives
    // here, never a pair.
    // robots.ts reads headers() at request time, so it cannot be called here; the source is the
    // thing being constrained anyway.
    const source = readFileSync(resolve(process.cwd(), "app/robots.ts"), "utf8");
    const disallowLines = source
      .split("\n")
      .filter((line) => line.includes("disallow"))
      .map((line) => line.trim());
    for (const line of disallowLines) {
      expect(line.includes("auth"), `robots.ts disallows auth while auth routes rely on noindex: ${line}`).toBe(false);
    }
  });

  it("treats an ordinary content route as indexable", () => {
    expect(isNoindexPublicRoute("/pricing")).toBe(false);
    expect(SITEMAP_CONTENT_ROUTES).toContain("/pricing");
    expect(SITEMAP_CONTENT_ROUTES).toContain("/blog/:slug");
  });
});
