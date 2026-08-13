import type { AnchorHTMLAttributes, ReactNode } from "react";

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { REPO_ROOT } from "./walk";

vi.mock("@/components/shared/app-link", () => ({
  AppLink: ({
    appearance: _appearance,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    appearance?: string;
    children?: ReactNode;
  }) => createElement("a", props, children),
}));

import { HubPagination } from "@/components/marketing/hub-pagination";
import {
  hubPageCount,
  hubPageHref,
  hubPagerModel,
  paginateHub,
  paginateLocalizedHubPages,
  resolveHubPage,
} from "@/core/seo/hub-pagination";
import { LANDING_HUBS } from "@/core/seo/landing-hubs";
import { CONTENT_LOCALES } from "@/i18n/locale-registry";
import { PUBLIC_ROUTES } from "@/i18n/routing";

const ENFORCED = true;
const CLICK_BOUND = 4;

const HOME_PAGE_SOURCE = join(REPO_ROOT, "app", "[locale]", "(static)", "page.tsx");
const FOOTER_SOURCE = join(REPO_ROOT, "app", "components", "footer-content.tsx");
const HUB_ROUTE_FILES = new Map([
  ["/blog", join(REPO_ROOT, "app", "[locale]", "(static)", "blog", "page.tsx")],
  ["/compare", join(REPO_ROOT, "app", "[locale]", "(static)", "compare", "page.tsx")],
  ["/features/all", join(REPO_ROOT, "app", "[locale]", "(static)", "features", "all", "page.tsx")],
  ["/for", join(REPO_ROOT, "app", "[locale]", "(static)", "for", "page.tsx")],
]);

function collectionSlugs(collection: string, locale: string): string[] {
  const directory = join(REPO_ROOT, "content", collection, locale);
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name) === ".mdx")
    .map((entry) => entry.name.slice(0, -".mdx".length))
    .sort();
}

function renderedPagerHrefs(basePath: string, page: number, pageCount: number): string[] {
  const html = renderToStaticMarkup(
    createElement(HubPagination, {
      basePath,
      label: `${basePath} pagination`,
      nextLabel: "Next",
      page,
      pageCount,
      previousLabel: "Previous",
    }),
  );

  return [...html.matchAll(/\shref="([^"]+)"/gu)].map((match) => match[1].replaceAll("&amp;", "&"));
}

function buildRenderedGraph(slugsByHub: ReadonlyMap<string, readonly string[]>): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  for (const { detailPath, hubPath } of LANDING_HUBS) {
    const slugs = slugsByHub.get(hubPath) ?? [];
    const pageCount = hubPageCount(slugs.length);

    for (let page = 1; page <= pageCount; page++) {
      const cards = paginateHub(slugs, page).items.map((slug) => `${detailPath}/${slug}`);
      graph.set(hubPageHref(hubPath, page), [...cards, ...renderedPagerHrefs(hubPath, page, pageCount)]);
    }
  }

  graph.set(
    "/",
    LANDING_HUBS.map(({ hubPath }) => hubPath),
  );
  return graph;
}

function landingRouteCollisions(slugsByHub: ReadonlyMap<string, readonly string[]>): string[] {
  const reservedRoutes = new Set<string>(PUBLIC_ROUTES.filter((route) => !route.includes(":")));

  return LANDING_HUBS.flatMap(({ detailPath, hubPath }) =>
    (slugsByHub.get(hubPath) ?? [])
      .map((slug) => `${detailPath}/${slug}`)
      .filter((detailRoute) => reservedRoutes.has(detailRoute))
      .map((detailRoute) => `${detailRoute} collides with a static public route`),
  );
}

function clickDepths(graph: ReadonlyMap<string, readonly string[]>): Map<string, number> {
  const depths = new Map<string, number>([["/", 0]]);
  let frontier = ["/"];

  while (frontier.length > 0) {
    const next: string[] = [];

    for (const node of frontier) {
      for (const edge of graph.get(node) ?? []) {
        if (depths.has(edge)) continue;
        depths.set(edge, (depths.get(node) ?? 0) + 1);
        next.push(edge);
      }
    }

    frontier = next;
  }

  return depths;
}

describe("hub pagination and rendered reachability", () => {
  it("strictly resolves the page query without producing duplicate 200 pages", () => {
    expect(resolveHubPage(undefined, 3)).toEqual({ kind: "page", page: 1 });
    expect(resolveHubPage("1", 3)).toEqual({
      kind: "redirect-page-one",
      page: 1,
    });
    expect(resolveHubPage("2", 3)).toEqual({ kind: "page", page: 2 });

    const invalidValues: Array<string | string[]> = [
      ["2"],
      "",
      "0",
      "01",
      "+2",
      "2.0",
      "2junk",
      "4",
      "9007199254740992",
    ];

    for (const invalid of invalidValues) {
      expect(resolveHubPage(invalid, 3), String(invalid)).toEqual({
        kind: "not-found",
      });
    }
  });

  it("renders crawlable previous, next, bucket, and current-page semantics", () => {
    const html = renderToStaticMarkup(
      createElement(HubPagination, {
        basePath: "/blog",
        label: "Blog",
        nextLabel: "Next page",
        page: 37,
        pageCount: 94,
        previousLabel: "Previous page",
      }),
    );
    const hrefs = renderedPagerHrefs("/blog", 37, 94);

    expect(html).toContain('<nav aria-label="Blog"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('rel="prev"');
    expect(html).toContain('rel="next"');
    expect(hrefs).toContain("/blog?page=36");
    expect(hrefs).toContain("/blog?page=38");
    expect(hrefs).toContain("/blog?page=31");
    expect(hrefs).not.toContain("/blog?page=37");
  });

  it("keeps the square-root pager link budget sublinear at backlog scale", () => {
    const pageCount = hubPageCount(2_256);
    const maximumLinks = Math.max(
      ...Array.from({ length: pageCount }, (_, index) => renderedPagerHrefs("/blog", index + 1, pageCount).length),
    );

    expect(pageCount).toBe(94);
    expect(maximumLinks).toBeLessThanOrEqual(2 * Math.ceil(Math.sqrt(pageCount)) + 2);
    expect(hubPagerModel(1, pageCount).pageNumbers).toContain(91);
  });

  it("uses the default sequence to keep localized page membership aligned", () => {
    const reference = ["c", "a", "d", "b"].map((slug) => ({
      label: slug,
      url: `/items/${slug}`,
    }));
    const localized = ["b", "d", "a", "c"].map((slug) => ({
      label: `localized-${slug}`,
      url: `/items/${slug}`,
    }));
    const compare = (a: { slug: string }, b: { slug: string }) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

    expect(paginateLocalizedHubPages(reference, reference, 1, compare).items.map(({ slug }) => slug)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(paginateLocalizedHubPages(reference, localized, 1, compare).items.map(({ slug }) => slug)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("partitions collections into complete, non-overlapping 24-card pages", () => {
    const slugs = Array.from({ length: 50 }, (_, index) => `slug-${index}`);
    const pages = Array.from({ length: hubPageCount(slugs.length) }, (_, index) => paginateHub(slugs, index + 1));

    expect(pages.flatMap(({ items }) => items)).toEqual(slugs);
    expect(pages.map(({ items }) => items.length)).toEqual([24, 24, 2]);
    expect(() => paginateHub(slugs, 4)).toThrow(RangeError);
  });

  it("keeps the proxy's lightweight page-count registry aligned with published content", () => {
    for (const { collection, hubPath, pageCount } of LANDING_HUBS) {
      for (const locale of CONTENT_LOCALES) {
        expect(pageCount, `${hubPath} page count drifted from ${collection}/${locale}`).toBe(
          hubPageCount(collectionSlugs(collection, locale).length),
        );
      }
    }
  });

  it("wires the real pager and shared resolver into all four production hubs", () => {
    const home = readFileSync(HOME_PAGE_SOURCE, "utf8");
    const footer = readFileSync(FOOTER_SOURCE, "utf8");

    expect(home).toContain("<Footer />");
    for (const { hubPath } of LANDING_HUBS) {
      expect(footer, `footer does not link ${hubPath}`).toContain(`href="${hubPath}"`);
      const routeFile = HUB_ROUTE_FILES.get(hubPath);
      expect(routeFile, `missing route file declaration for ${hubPath}`).toBeDefined();
      const source = readFileSync(routeFile as string, "utf8");
      expect(source).toContain("paginateLocalizedHubPages(");
      expect(source).toContain("resolveHubPage(");
      expect(source).toContain("<HubPagination");
    }

    const sitemap = readFileSync(join(REPO_ROOT, "app", "sitemap.ts"), "utf8");
    expect(sitemap).toContain("LANDING_HUBS");
    expect(sitemap).toContain("hubPageHref(");
  });

  it("reserves every static public route from landing-page slug collisions", () => {
    const problems: string[] = [];

    for (const locale of CONTENT_LOCALES) {
      const slugsByHub = new Map(
        LANDING_HUBS.map(({ collection, hubPath }) => [hubPath, collectionSlugs(collection, locale)] as const),
      );
      problems.push(...landingRouteCollisions(slugsByHub).map((problem) => `${locale} ${problem}`));
    }

    expect(problems, `landing pages hidden behind static routes:\n${problems.join("\n")}`).toEqual([]);
    expect(landingRouteCollisions(new Map([["/features/all", ["all"]]]))).toEqual([
      "/features/all collides with a static public route",
    ]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    `reaches every localized landing page through rendered pager hrefs within ${CLICK_BOUND} clicks`,
    () => {
      const problems: string[] = [];

      for (const locale of CONTENT_LOCALES) {
        const slugsByHub = new Map(
          LANDING_HUBS.map(({ collection, hubPath }) => [hubPath, collectionSlugs(collection, locale)] as const),
        );
        const depths = clickDepths(buildRenderedGraph(slugsByHub));

        for (const { detailPath, hubPath } of LANDING_HUBS) {
          const slugs = slugsByHub.get(hubPath) ?? [];
          expect(slugs.length, `${collectionSlugs.name} found no ${locale} pages for ${hubPath}`).toBeGreaterThan(0);

          for (const slug of slugs) {
            const route = `${detailPath}/${slug}`;
            const depth = depths.get(route);
            if (depth === undefined) problems.push(`${locale} ${route} is unreachable`);
            else if (depth > CLICK_BOUND) problems.push(`${locale} ${route} is ${depth} clicks away`);
          }
        }
      }

      expect(problems, `landing pages beyond the click bound:\n${problems.join("\n")}`).toEqual([]);
    },
  );

  it(`keeps the ${CLICK_BOUND}-click bound for a 2,256-page family`, () => {
    const slugs = Array.from({ length: 2_256 }, (_, index) => `page-${index}`);
    const graph = buildRenderedGraph(
      new Map(LANDING_HUBS.map(({ hubPath }) => [hubPath, hubPath === "/blog" ? slugs : ["only-page"]])),
    );
    const depths = clickDepths(graph);
    const worst = Math.max(...slugs.map((slug) => depths.get(`/blog/${slug}`) ?? Infinity));

    expect(worst).toBe(CLICK_BOUND);
  });
});
