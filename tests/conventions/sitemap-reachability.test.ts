import { describe, expect, it } from "vitest";

import { RETIRED_ROUTE_PATHS } from "@/core/seo/route-aliases";

const E2E_BASE_URL = process.env.HUB_E2E_BASE_URL?.replace(/\/+$/u, "");

const CONCURRENCY = 8;

async function sitemapLocations(): Promise<string[]> {
  const response = await fetch(new URL("/sitemap.xml", E2E_BASE_URL), {
    signal: AbortSignal.timeout(60_000),
  });
  expect(response.status, "the sitemap itself must be served").toBe(200);
  const xml = await response.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1]);
}

async function mapWithLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function run(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function canonicalOf(html: string): string {
  return /rel="canonical" href="([^"]+)"/u.exec(html)?.[1] ?? "";
}

// Two defects put URLs into the sitemap that never belonged there. Eight auth URLs were submitted with
// no noindex, and /docs/intro-page was submitted alongside /docs while both rendered the same MDX and
// each canonicalised to itself. Neither showed up as a failure anywhere: both returned 200. The only
// check that catches this class is asking the running server what it actually serves for every
// submitted URL, so this runs against a real build rather than the route registry that produced it.
describe("sitemap reachability", () => {
  it.skipIf(!E2E_BASE_URL)(
    "submits only URLs that answer 200 and point their canonical at themselves",
    async () => {
      const locations = await sitemapLocations();
      expect(locations.length, "the sitemap should not be empty").toBeGreaterThan(100);

      expect(
        new Set(locations).size,
        "a duplicate loc splits one page's signal across two identical entries",
      ).toBe(locations.length);

      const retired = new Set<string>(RETIRED_ROUTE_PATHS);
      const submittedRetired = locations.filter((location) =>
        retired.has(new URL(location).pathname.replace(/^\/[a-z]{2}(?=\/|$)/u, "")),
      );
      expect(submittedRetired, "a retired URL in the sitemap asks Google to crawl a redirect").toEqual([]);

      const failures = await mapWithLimit(locations, CONCURRENCY, async (location) => {
        const response = await fetch(location, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
        if (response.status !== 200) return `${location} answered ${response.status}`;

        const canonical = canonicalOf(await response.text());
        if (canonical !== location) return `${location} canonicalises to ${canonical || "nothing"}`;
        return null;
      });

      expect(failures.filter(Boolean), "every submitted URL must be the canonical live page").toEqual([]);
    },
    180_000,
  );
});
