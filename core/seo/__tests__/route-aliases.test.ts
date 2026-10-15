import { existsSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DELETED_ROUTE_PATHS,
  DUPLICATE_ROUTE_PATHS,
  PERMANENT_ROUTE_ALIASES,
  RETIRED_ROUTE_PATHS,
  isRetiredRoutePath,
  permanentAliasRedirects,
  retiredAppRouteRedirects,
} from "@/core/seo/route-aliases";
import { APP_LOCALES, CONTENT_LOCALES, DEFAULT_LOCALE, buildLocalePath } from "@/i18n/locale-registry";
import { PUBLIC_ROUTES, isProtectedPathname } from "@/i18n/routing";

const REPO_ROOT = resolve(__dirname, "../../..");

const COLLECTION_BY_PREFIX: Record<string, string> = {
  "/blog/": "blog-posts",
  "/compare/": "compare-pages",
  "/docs/": "docs",
};

const STATIC_ROUTES = new Set<string>(PUBLIC_ROUTES.filter((route) => !route.includes(":")));

function publishedSlugs(collection: string, locale: string): Set<string> {
  const directory = join(REPO_ROOT, "content", collection, locale);
  if (!existsSync(directory)) return new Set();
  return new Set(
    readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && extname(entry.name) === ".mdx")
      .map((entry) => entry.name.slice(0, -".mdx".length)),
  );
}

function prefixOf(routePath: string): string | null {
  return Object.keys(COLLECTION_BY_PREFIX).find((prefix) => routePath.startsWith(prefix)) ?? null;
}

function resolvesToLivePage(routePath: string, locale: string): boolean {
  if (STATIC_ROUTES.has(routePath)) return true;
  const prefix = prefixOf(routePath);
  if (!prefix) return false;
  return publishedSlugs(COLLECTION_BY_PREFIX[prefix], locale).has(routePath.slice(prefix.length));
}

describe("permanent route aliases", () => {
  it("points every retired route at a destination that still resolves", () => {
    for (const locale of CONTENT_LOCALES) {
      for (const destination of new Set(Object.values(PERMANENT_ROUTE_ALIASES))) {
        expect(
          resolvesToLivePage(destination, locale),
          `${destination} does not resolve in ${locale}, so the redirect would send a crawler from one dead URL to another`,
        ).toBe(true);
      }
    }
  });

  it("keeps every deleted route genuinely deleted in every content locale", () => {
    for (const locale of CONTENT_LOCALES) {
      for (const retired of DELETED_ROUTE_PATHS) {
        expect(
          resolvesToLivePage(retired, locale),
          `${retired} is still published in ${locale}; a half-retirement leaves the duplicate competing on one side while the redirect fires on the other`,
        ).toBe(false);
      }
    }
  });

  it("keeps every duplicate route backed by content it no longer serves at its own URL", () => {
    expect(
      DUPLICATE_ROUTE_PATHS.length,
      "a duplicate alias whose file was deleted belongs in the retired list instead",
    ).toBeGreaterThan(0);

    for (const locale of CONTENT_LOCALES) {
      for (const duplicate of DUPLICATE_ROUTE_PATHS) {
        expect(
          resolvesToLivePage(duplicate, locale),
          `${duplicate} has no content file in ${locale}; retiring it outright would delete the page its survivor renders`,
        ).toBe(true);
      }
    }
  });

  it("covers every alias by exactly one of the two lists", () => {
    expect([...DELETED_ROUTE_PATHS, ...DUPLICATE_ROUTE_PATHS].sort()).toEqual([...RETIRED_ROUTE_PATHS].sort());
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
    for (const retired of RETIRED_ROUTE_PATHS) {
      expect(STATIC_ROUTES.has(retired), `${retired} is a declared public route and cannot be aliased away`).toBe(
        false,
      );
    }
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

describe("retired app routes", () => {
  const redirects = retiredAppRouteRedirects();
  const destinationOf = (source: string) => redirects.find((redirect) => redirect.source === source)?.destination;

  it("sends the pre-upgrade list, record, workspace and profile URLs to their current pages", () => {
    expect(destinationOf("/contacts")).toBe("/open/records/contact");
    expect(destinationOf("/organizations")).toBe("/open/records/organization");
    expect(destinationOf("/deals")).toBe("/open/records/deal");
    expect(destinationOf("/services")).toBe("/open/records/service");
    expect(destinationOf("/tasks")).toBe("/open/records/task");
    expect(destinationOf("/de/deals/:recordId")).toBe("/de/open/records/deal/:recordId");
    expect(destinationOf("/company/members")).toBe("/settings/members");
    expect(destinationOf("/company/audit-logs")).toBe("/settings/activity");
    expect(destinationOf("/company/settings")).toBe("/configure");
    expect(destinationOf("/fr/profile/api-keys")).toBe("/fr/settings/api-keys");
    expect(destinationOf("/profile/settings")).toBe("/settings/profile");
  });

  it("redirects permanently from every app locale and from the unprefixed URL, without loops", () => {
    const sources = redirects.map((redirect) => redirect.source);
    expect(new Set(sources).size, "duplicate redirect sources").toBe(sources.length);

    for (const redirect of redirects) {
      expect(redirect.permanent).toBe(true);
      expect(redirect.source).not.toBe(redirect.destination);
      expect(isProtectedPathname(redirect.source), `${redirect.source} is still a live route`).toBe(false);
      expect(isProtectedPathname(redirect.destination), `${redirect.destination} is not an app route`).toBe(true);
    }

    for (const redirect of redirects.filter(
      (candidate) => !APP_LOCALES.some((locale) => candidate.source.startsWith(`/${locale}/`)),
    )) {
      for (const locale of APP_LOCALES) {
        expect(destinationOf(buildLocalePath(locale, redirect.source))).toBe(
          buildLocalePath(locale, redirect.destination),
        );
      }
    }
  });
});
