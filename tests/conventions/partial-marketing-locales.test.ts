import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

import { i18n, marketingI18n } from "@/core/fumadocs/i18n";
import { SOLUTION_CATALOG } from "@/core/solutions/solution-catalog";
import {
  CONTENT_LOCALES,
  MARKETING_LOCALES,
  PARTIAL_MARKETING_LOCALES,
  isMarketingPathPublished,
  partialMarketingPaths,
} from "@/i18n/locale-registry";

const CONTENT_ROOT = join(REPO_ROOT, "content");

const COLLECTION_ROUTES: Record<string, (slug: string) => string> = {
  "feature-pages": (slug) => `/features/${slug}`,
  for: () => "/for",
  "for-pages": (slug) => `/for/${slug}`,
  homepage: () => "/",
  pricing: () => "/pricing",
};

function partialLocaleFiles(locale: string): { collection: string; slug: string }[] {
  return readdirSync(CONTENT_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(CONTENT_ROOT, entry.name, locale)))
    .flatMap((entry) =>
      readdirSync(join(CONTENT_ROOT, entry.name, locale))
        .filter((file) => file.endsWith(".mdx"))
        .map((file) => ({ collection: entry.name, slug: file.slice(0, -".mdx".length) })),
    );
}

describe("partial marketing locales", () => {
  it("keeps documentation and other full-content collections on the full content locales", () => {
    expect([...i18n.languages].sort()).toEqual([...CONTENT_LOCALES].sort());
    expect([...marketingI18n.languages].sort()).toEqual([...MARKETING_LOCALES].sort());
    for (const locale of PARTIAL_MARKETING_LOCALES) expect(i18n.languages).not.toContain(locale);
  });

  it("publishes exactly the scoped pages, each backed by one content file", () => {
    for (const locale of PARTIAL_MARKETING_LOCALES) {
      const problems: string[] = [];
      const routes = partialLocaleFiles(locale).map(({ collection, slug }) => {
        const route = COLLECTION_ROUTES[collection]?.(slug);
        if (!route) problems.push(`content/${collection}/${locale}/${slug}.mdx is outside the marketing collections`);
        else if (!isMarketingPathPublished(locale, route))
          problems.push(`content/${collection}/${locale}/${slug}.mdx (${route}) is outside the ${locale} scope`);
        return route;
      });

      for (const path of partialMarketingPaths(locale))
        if (!routes.includes(path)) problems.push(`${locale} scope path ${path} has no content file`);

      expect(problems).toEqual([]);
    }
  });

  it("offers in navigation only the solutions whose landing page the locale publishes", () => {
    for (const locale of PARTIAL_MARKETING_LOCALES) {
      const offered = SOLUTION_CATALOG.filter((entry) => entry.publicLocales.includes(locale));
      expect(offered.length).toBeGreaterThan(0);
      for (const entry of SOLUTION_CATALOG)
        expect(entry.publicLocales.includes(locale)).toBe(isMarketingPathPublished(locale, entry.landingPath));
    }
  });
});
