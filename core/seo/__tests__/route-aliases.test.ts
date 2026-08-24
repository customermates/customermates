import { existsSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PERMANENT_ROUTE_ALIASES,
  RETIRED_ROUTE_PATHS,
  isRetiredRoutePath,
  permanentAliasRedirects,
} from "@/core/seo/route-aliases";
import { CONTENT_LOCALES, DEFAULT_LOCALE, buildLocalePath } from "@/i18n/locale-registry";
import { PUBLIC_ROUTES } from "@/i18n/routing";

const REPO_ROOT = resolve(__dirname, "../../..");

function comparePageSlugs(locale: string): Set<string> {
  const directory = join(REPO_ROOT, "content", "compare-pages", locale);
  if (!existsSync(directory)) return new Set();
  return new Set(
    readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && extname(entry.name) === ".mdx")
      .map((entry) => entry.name.slice(0, -".mdx".length)),
  );
}

function slugOf(routePath: string): string {
  return routePath.slice("/compare/".length);
}

describe("permanent route aliases", () => {
  it("points every retired route at a page that still exists", () => {
    for (const locale of CONTENT_LOCALES) {
      const slugs = comparePageSlugs(locale);
      for (const survivor of Object.values(PERMANENT_ROUTE_ALIASES)) {
        expect(
          slugs.has(slugOf(survivor)),
          `${survivor} does not exist in ${locale}, so the redirect would send a crawler from one dead URL to another`,
        ).toBe(true);
      }
    }
  });

  it("keeps every retired route genuinely retired in every content locale", () => {
    for (const locale of CONTENT_LOCALES) {
      const slugs = comparePageSlugs(locale);
      for (const retired of RETIRED_ROUTE_PATHS) {
        expect(
          slugs.has(slugOf(retired)),
          `${retired} is still published in ${locale}; a half-retirement leaves the duplicate competing on one side while the redirect fires on the other`,
        ).toBe(false);
      }
    }
  });

  it("never chains one alias into another", () => {
    for (const destination of Object.values(PERMANENT_ROUTE_ALIASES)) {
      expect(
        isRetiredRoutePath(destination),
        `${destination} is itself retired, so this alias chains; every extra hop is one a crawler may decline to follow`,
      ).toBe(false);
    }
  });

  it("never retires a route the application still declares", () => {
    const declared = new Set<string>(PUBLIC_ROUTES.filter((route) => !route.includes(":")));
    for (const retired of RETIRED_ROUTE_PATHS)
      expect(declared.has(retired), `${retired} is a declared public route and cannot be aliased away`).toBe(false);
  });

  it("emits a permanent redirect per content locale plus a locale-less entry", () => {
    const redirects = permanentAliasRedirects();
    expect(redirects).toHaveLength(RETIRED_ROUTE_PATHS.length * (CONTENT_LOCALES.length + 1));

    for (const redirect of redirects) {
      expect(redirect.permanent, `${redirect.source} must be permanent to consolidate ranking signal`).toBe(true);
      expect(redirect.source.startsWith("/"), redirect.source).toBe(true);
      expect(redirect.destination.startsWith("/"), redirect.destination).toBe(true);
      expect(redirect.source, "a redirect to itself is a loop").not.toBe(redirect.destination);
    }

    const sources = redirects.map((redirect) => redirect.source);
    expect(new Set(sources).size, "duplicate redirect sources").toBe(sources.length);

    for (const retired of RETIRED_ROUTE_PATHS) {
      const survivor = PERMANENT_ROUTE_ALIASES[retired];
      for (const locale of CONTENT_LOCALES) expect(sources).toContain(buildLocalePath(locale, retired));

      expect(sources).toContain(retired);
      expect(redirects.find((redirect) => redirect.source === retired)?.destination).toBe(
        buildLocalePath(DEFAULT_LOCALE, survivor),
      );
    }
  });
});
