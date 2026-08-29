import type { AnchorHTMLAttributes, ReactNode } from "react";

import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { extname, join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { REPO_ROOT } from "./walk";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string, options?: { contentType?: string }) => { window: { document: Document } };
};

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

const routeFixtures = vi.hoisted(() => {
  const pages = (basePath: string, count: number, data: (slug: string) => Record<string, unknown>) =>
    Array.from({ length: count }, (_, index) => {
      const slug = `page-${String(index + 1).padStart(3, "0")}`;
      return { data: data(slug), url: `${basePath}/${slug}` };
    });

  return {
    blog: pages("/blog", 71, (slug) => ({
      blogPost: { date: "2026-01-01" },
      description: slug,
      hero: { title: slug },
      title: slug,
    })),
    compare: pages("/compare", 31, (slug) => ({
      competitorName: slug,
      description: slug,
    })),
    features: pages("/features", 24, (slug) => ({
      description: slug,
      featureName: slug,
    })),
    forPages: pages("/for", 42, (slug) => ({
      description: slug,
      industryName: slug,
    })),
  };
});

vi.mock("@/core/fumadocs/source", () => {
  const collection = (pages: readonly unknown[]) => ({ getPages: () => pages });
  const hub = (title: string) => ({
    getPage: () => ({
      data: {
        cta: {
          action: "Start now",
          buttonLeftHref: "/auth/signup",
          buttonLeftText: "Start",
          buttonRightHref: "/features",
          buttonRightText: "Explore",
          description: "CTA description",
          hint: "CTA hint",
        },
        hero: {},
        title,
      },
    }),
  });

  return {
    blogPostsSource: collection(routeFixtures.blog),
    blogSource: hub("Blog"),
    comparePagesSource: collection(routeFixtures.compare),
    compareSource: hub("Compare"),
    featurePagesSource: collection(routeFixtures.features),
    featuresAllSource: hub("Features"),
    forPagesSource: collection(routeFixtures.forPages),
    forSource: hub("Industries"),
  };
});

vi.mock("@/core/fumadocs/metadata", () => ({
  generateMetadataFromMeta: vi.fn(),
}));
vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async () => (key: string) => key,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("unexpected notFound");
  },
  permanentRedirect: (href: string) => {
    throw new Error(`unexpected permanentRedirect to ${href}`);
  },
  redirect: (href: string) => {
    throw new Error(`unexpected redirect to ${href}`);
  },
}));
vi.mock("@/app/components/footer", () => ({ Footer: () => null }));
vi.mock("@/components/marketing/cta-section", () => ({ CTASection: () => null }));
vi.mock("@/components/marketing/page-hero", () => ({ PageHero: () => null }));
vi.mock("@/components/seo/json-ld", () => ({ JsonLd: () => null }));
vi.mock("@/components/marketing/hub-grid", async () => {
  const { createElement } = await import("react");
  return {
    HubGrid: ({ items }: { items: { href: string }[] }) =>
      createElement(
        "div",
        { "data-hub-results": "" },
        items.map((item) => createElement("a", { href: item.href, key: item.href }, item.href)),
      ),
  };
});
vi.mock("@/app/[locale]/(static)/blog/blog-post-card", async () => {
  const { createElement } = await import("react");
  return {
    BlogPostCard: ({ url }: { url: string }) => createElement("a", { href: url }, url),
  };
});

import { HubPagination } from "@/components/marketing/hub-pagination";
import { selectFooterSlugs } from "@/app/components/footer-selection";
import {
  HUB_PAGE_PARAM,
  hubPageCount,
  hubPageHref,
  hubPageOneRedirectHref,
  hubPagerModel,
  paginateHub,
  paginateLocalizedHubPages,
  resolveHubPage,
} from "@/core/seo/hub-pagination";
import { LANDING_HUBS } from "@/core/seo/landing-hubs";
import { CONTENT_LOCALES, DEFAULT_LOCALE, type ContentLocale, buildLocalePath } from "@/i18n/locale-registry";
import { PUBLIC_ROUTES } from "@/i18n/routing";

const CLICK_BOUND = 4;
const E2E_BASE_URL = process.env.HUB_E2E_BASE_URL?.replace(/\/+$/u, "");

function collectionSlugs(collection: string, locale: string): string[] {
  const directory = join(REPO_ROOT, "content", collection, locale);
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name) === ".mdx")
    .map((entry) => entry.name.slice(0, -".mdx".length))
    .sort();
}

function publishedHubPageCount(collection: string): number {
  return hubPageCount(collectionSlugs(collection, DEFAULT_LOCALE).length);
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

type HubPageComponent = (props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => Promise<ReactNode>;

type LandingHubPath = (typeof LANDING_HUBS)[number]["hubPath"];
type HubPageModule = { default: HubPageComponent };

const HUB_PAGE_LOADERS = {
  "/blog": () => import("@/app/[locale]/(static)/blog/page"),
  "/compare": () => import("@/app/[locale]/(static)/compare/page"),
  "/features/all": () => import("@/app/[locale]/(static)/features/all/page"),
  "/for": () => import("@/app/[locale]/(static)/for/page"),
} satisfies Record<LandingHubPath, () => Promise<HubPageModule>>;

async function renderProductionHub(hubPath: LandingHubPath, page: number): Promise<string> {
  const component = (await HUB_PAGE_LOADERS[hubPath]()).default;

  const node = await component({
    params: Promise.resolve({ locale: "en" }),
    searchParams: Promise.resolve(page === 1 ? {} : { page: String(page) }),
  });
  return renderToStaticMarkup(node);
}

function hrefsIn(document: Document, selector: string): string[] {
  return [...document.querySelectorAll<HTMLAnchorElement>(selector)].map((anchor) => anchor.getAttribute("href") ?? "");
}

function buildPagerGraph(basePath: string, pageCount: number): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  for (let page = 1; page <= pageCount; page++) {
    graph.set(hubPageHref(basePath, page), renderedPagerHrefs(basePath, page, pageCount));
  }
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

function clickDepths(graph: ReadonlyMap<string, readonly string[]>, start: string = "/"): Map<string, number> {
  const depths = new Map<string, number>([[start, 0]]);
  let frontier = [start];

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

function pathWithQuery(href: string, baseUrl: string): string {
  const url = new URL(href, baseUrl);
  return `${url.pathname}${url.search}`;
}

function sameOriginPath(href: string, baseUrl: string): string | null {
  const url = new URL(href, baseUrl);
  const base = new URL(baseUrl);
  return url.origin === base.origin ? pathWithQuery(url.href, baseUrl) : null;
}

async function e2eResponse(path: string, init: RequestInit = {}): Promise<Response> {
  if (!E2E_BASE_URL) throw new Error("HUB_E2E_BASE_URL is required");
  return fetch(new URL(path, E2E_BASE_URL), {
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
    ...init,
  });
}

async function semanticRedirectPath(response: Response, label: string): Promise<string> {
  // permanentRedirect() must reach the client as a 308 with a Location header. The former
  // [200, 308] tolerance accepted a 200 carrying <meta http-equiv="refresh">, which is what a
  // Suspense boundary above the locale segment produced once the status had already been
  // committed. A meta refresh does not consolidate ranking signals the way a 308 does.
  expect(response.status, `${label} redirect transport`).toBe(308);
  const location = response.headers.get("location");
  expect(location, `${label} location`).not.toBeNull();
  if (!location) throw new Error(`${label} did not include a location`);
  const path = sameOriginPath(location, E2E_BASE_URL as string);
  expect(path, `${label} same-origin location`).not.toBeNull();
  if (!path) throw new Error(`${label} redirected outside the application`);
  return path;
}

async function expectSemanticNotFound(response: Response, label: string, _locale: ContentLocale): Promise<void> {
  // A missing page must answer 404, not a 200 carrying a not-found card. The previous [200, 404]
  // tolerance described a defect rather than a contract: a loading boundary above the locale
  // segment committed the status before the body could throw, so every mistyped URL under
  // /blog, /compare, /for, /features and /docs answered 200 and read to a crawler as a live page.
  expect(response.status, `${label} status`).toBe(404);
  expect(response.headers.get("content-type"), `${label} content type`).toContain("text/html");

  // A genuine 404 renders Next's not-found shell rather than the locale layout, so the document
  // element carries no lang attribute. The localized copy is still served in the body; what a
  // crawler acts on is the status, the noindex directive and the absent canonical, all asserted
  // here. Restoring the locale shell on a 404 is tracked separately.
  const document = new JSDOM(await response.text()).window.document;
  expect(document.querySelector('meta[name="robots"]')?.getAttribute("content"), `${label} robots metadata`).toContain(
    "noindex",
  );
  expect(document.querySelector('link[rel="canonical"]'), `${label} canonical`).toBeNull();
}

async function expectCanonicalResponse(response: Response, expectedPath: string, label: string): Promise<void> {
  expect(response.status, `${label} final status`).toBe(200);
  expect(response.headers.get("content-type"), `${label} content type`).toContain("text/html");

  const document = new JSDOM(await response.text()).window.document;
  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  expect(canonical, `${label} canonical`).toBeDefined();
  const canonicalUrl = new URL(canonical as string, E2E_BASE_URL as string);
  expect(canonicalUrl.origin, `${label} canonical origin`).toBe(new URL(E2E_BASE_URL as string).origin);
  expect(pathWithQuery(canonicalUrl.href, E2E_BASE_URL as string), `${label} canonical`).toBe(expectedPath);
  expect(
    document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "",
    `${label} robots metadata`,
  ).not.toContain("noindex");
}

describe("hub pagination and rendered reachability", () => {
  it("strictly resolves the page query", () => {
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

  it("lets every real hub page own invalid and page-one query handling", async () => {
    for (const { collection, hubPath } of LANDING_HUBS) {
      const pageCount = publishedHubPageCount(collection);
      const component = (await HUB_PAGE_LOADERS[hubPath]()).default;
      const props = (searchParams: Record<string, string | string[] | undefined>) => ({
        params: Promise.resolve({ locale: "en" }),
        searchParams: Promise.resolve(searchParams),
      });

      await expect(component(props({ page: String(pageCount + 1) })), `${hubPath} invalid page`).rejects.toThrow(
        "unexpected notFound",
      );
      await expect(component(props({ page: ["2", "3"] })), `${hubPath} repeated page`).rejects.toThrow(
        "unexpected notFound",
      );

      const query = {
        page: "1",
        tag: ["sales", "crm"],
        utm_source: "proof",
      };
      await expect(component(props(query)), `${hubPath} page one`).rejects.toThrow(
        `unexpected permanentRedirect to /en${hubPath}?tag=sales&tag=crm&utm_source=proof`,
      );
    }
  });

  it("preserves unrelated and repeated query values while removing page one", () => {
    expect(
      hubPageOneRedirectHref("/blog", {
        page: "1",
        tag: ["sales", "crm"],
        utm_source: "proof",
      }),
    ).toBe("/blog?tag=sales&tag=crm&utm_source=proof");
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
    expect(html).toContain('class="w-full bg-sidebar pb-16 md:pb-24"');
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

  it("renders the real four hub page modules into complete 24-card slices and pager edges", async () => {
    const fixturePages = new Map<string, readonly { url: string }[]>([
      ["/blog", routeFixtures.blog],
      ["/compare", routeFixtures.compare],
      ["/features/all", routeFixtures.features],
      ["/for", routeFixtures.forPages],
    ]);

    for (const { detailPath, hubPath } of LANDING_HUBS) {
      const pageCount = hubPageCount((fixturePages.get(hubPath) ?? []).length);
      const expected = new Set((fixturePages.get(hubPath) ?? []).map(({ url }) => url));
      const renderedCards = new Set<string>();
      const graph = new Map<string, string[]>();

      for (let page = 1; page <= pageCount; page++) {
        const html = await renderProductionHub(hubPath, page);
        const document = new JSDOM(html).window.document;
        const cards = hrefsIn(document, "[data-hub-results] a[href]").filter((href) =>
          href.startsWith(`${detailPath}/`),
        );
        const pager = hrefsIn(document, "nav a[href]").filter(
          (href) => href === hubPath || href.startsWith(`${hubPath}?`),
        );

        expect(cards.length, `${hubPath} page ${page} card count`).toBeLessThanOrEqual(24);
        expect(new Set(cards).size, `${hubPath} page ${page} repeats a card`).toBe(cards.length);
        for (const href of cards) {
          expect(renderedCards.has(href), `${hubPath} repeats ${href} across pages`).toBe(false);
          renderedCards.add(href);
        }
        graph.set(hubPageHref(hubPath, page), [...cards, ...pager]);
      }

      expect(renderedCards, `${hubPath} did not render its complete collection`).toEqual(expected);
      const depths = clickDepths(graph, hubPath);
      for (const href of expected) {
        expect(depths.get(href), `${href} is not reachable through the production pager`).toBeLessThanOrEqual(3);
      }
    }
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

  it(`models the pager topology needed for a ${CLICK_BOUND}-click bound at 2,256 items`, () => {
    const pageCount = hubPageCount(2_256);
    const graph = buildPagerGraph("/blog", pageCount);
    const depths = clickDepths(graph, "/blog");
    const worstListPage = Math.max(
      ...Array.from({ length: pageCount }, (_, index) => depths.get(hubPageHref("/blog", index + 1)) ?? Infinity),
    );

    expect(pageCount).toBe(94);
    expect(worstListPage).toBe(2);
    // Home -> hub (1), at most two actual pager hops, then detail card (1).
    expect(1 + worstListPage + 1).toBe(CLICK_BOUND);
  });

  it.skipIf(!E2E_BASE_URL)(
    "crawls the production server output, metadata, semantic pagination outcomes, sitemap, and every localized detail route",
    async () => {
      const graph = new Map<string, string[]>();
      const details: string[] = [];
      const memberships = new Map<string, string[]>();
      let maxCards = 0;
      let maxHtmlBytes = 0;

      for (const locale of CONTENT_LOCALES) {
        const homePath = buildLocalePath(locale, "/");
        const home = await e2eResponse(homePath);
        expect(home.status, homePath).toBe(200);
        const homeHtml = await home.text();
        maxHtmlBytes = Math.max(maxHtmlBytes, Buffer.byteLength(homeHtml));
        const homeDocument = new JSDOM(homeHtml).window.document;
        const localizedHubs = new Set(LANDING_HUBS.map(({ hubPath }) => buildLocalePath(locale, hubPath)));
        graph.set(
          homePath,
          hrefsIn(homeDocument, "a[href]")
            .map((href) => sameOriginPath(href, E2E_BASE_URL as string))
            .filter((href): href is string => Boolean(href && localizedHubs.has(href))),
        );

        const publishedFooterDetails = new Set<string>();
        const expectedFooterDetails = new Set<string>();
        for (const { collection, detailPath } of LANDING_HUBS) {
          const slugs = collectionSlugs(collection, locale);
          for (const slug of slugs) {
            publishedFooterDetails.add(buildLocalePath(locale, `${detailPath}/${slug}`));
          }
          for (const slug of selectFooterSlugs(collection, slugs)) {
            expectedFooterDetails.add(buildLocalePath(locale, `${detailPath}/${slug}`));
          }
        }
        const renderedFooterDetails = hrefsIn(homeDocument, "footer a[href]")
          .map((href) => sameOriginPath(href, E2E_BASE_URL as string))
          .filter((href): href is string => Boolean(href && publishedFooterDetails.has(href)))
          .sort();
        expect(renderedFooterDetails, `${locale} rendered footer landing links`).toEqual(
          [...expectedFooterDetails].sort(),
        );
        expect(new Set(renderedFooterDetails).size, `${locale} duplicate footer landing links`).toBe(
          renderedFooterDetails.length,
        );

        for (const { collection, detailPath, hubPath } of LANDING_HUBS) {
          const pageCount = publishedHubPageCount(collection);
          const expected = new Set(
            collectionSlugs(collection, locale).map((slug) => buildLocalePath(locale, `${detailPath}/${slug}`)),
          );
          const rendered = new Set<string>();

          for (let page = 1; page <= pageCount; page++) {
            const route = buildLocalePath(locale, hubPageHref(hubPath, page));
            const response = await e2eResponse(route);
            expect(response.status, route).toBe(200);
            const html = await response.text();
            maxHtmlBytes = Math.max(maxHtmlBytes, Buffer.byteLength(html));
            const document = new JSDOM(html).window.document;
            const detailPrefix = buildLocalePath(locale, `${detailPath}/`);
            const cards = hrefsIn(document, "[data-hub-results] a[href]")
              .map((href) => sameOriginPath(href, E2E_BASE_URL as string))
              .filter((href): href is string => Boolean(href?.startsWith(detailPrefix)));
            const pager = hrefsIn(document, "nav a[href]")
              .map((href) => sameOriginPath(href, E2E_BASE_URL as string))
              .filter((href): href is string => {
                const cleanHub = buildLocalePath(locale, hubPath);
                return href === cleanHub || Boolean(href?.startsWith(`${cleanHub}?`));
              });

            expect(cards.length, `${route} card count`).toBeGreaterThan(0);
            expect(cards.length, `${route} card count`).toBeLessThanOrEqual(24);
            expect(new Set(cards).size, `${route} duplicate cards`).toBe(cards.length);
            maxCards = Math.max(maxCards, cards.length);
            for (const card of cards) {
              expect(rendered.has(card), `${card} appears on multiple ${hubPath} pages`).toBe(false);
              rendered.add(card);
              details.push(card);
            }
            graph.set(route, [...cards, ...pager]);

            const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
            expect(canonical, `${route} canonical`).toBeDefined();
            const canonicalUrl = new URL(canonical as string, E2E_BASE_URL as string);
            expect(canonicalUrl.origin, `${route} canonical origin`).toBe(new URL(E2E_BASE_URL as string).origin);
            expect(pathWithQuery(canonicalUrl.href, E2E_BASE_URL as string), `${route} canonical`).toBe(route);

            const alternateLinks = [...document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')];
            const alternates = new Map(
              alternateLinks.map((link) => [
                link.getAttribute("hreflang"),
                pathWithQuery(link.href, E2E_BASE_URL as string),
              ]),
            );
            for (const link of alternateLinks) {
              expect(new URL(link.href, E2E_BASE_URL as string).origin, `${route} alternate canonical origin`).toBe(
                canonicalUrl.origin,
              );
            }
            for (const alternateLocale of CONTENT_LOCALES) {
              expect(alternates.get(alternateLocale), `${route} ${alternateLocale} alternate`).toBe(
                buildLocalePath(alternateLocale, hubPageHref(hubPath, page)),
              );
            }
            expect(alternates.get("x-default"), `${route} x-default alternate`).toBe(
              buildLocalePath("en", hubPageHref(hubPath, page)),
            );

            memberships.set(
              `${locale}:${hubPath}:${page}`,
              cards.map((href) => href.split("/").at(-1) as string).sort(),
            );
          }

          expect(rendered, `${locale} ${hubPath} rendered membership`).toEqual(expected);

          const pageOne = await e2eResponse(`${buildLocalePath(locale, hubPath)}?page=1&utm_source=e2e&tag=a&tag=b`);
          expect(pageOne.status, `${locale} ${hubPath} page-one transport`).toBe(308);
          const pageOneLocation = await semanticRedirectPath(pageOne, `${locale} ${hubPath} page one`);
          expect(pageOneLocation).toBe(`${buildLocalePath(locale, hubPath)}?utm_source=e2e&tag=a&tag=b`);
          await expectCanonicalResponse(
            await e2eResponse(pageOneLocation),
            buildLocalePath(locale, hubPath),
            `${locale} ${hubPath} page one destination`,
          );

          const invalidPage = await e2eResponse(`${buildLocalePath(locale, hubPath)}?page=${pageCount + 1}`);
          await expectSemanticNotFound(invalidPage, `${locale} ${hubPath} invalid page`, locale);
        }

        const depths = clickDepths(graph, homePath);
        for (const detail of details.filter((path) => path.startsWith(`/${locale}/`))) {
          expect(depths.get(detail), `${detail} rendered click depth`).toBeLessThanOrEqual(CLICK_BOUND);
        }
      }

      for (const { collection, hubPath } of LANDING_HUBS) {
        const pageCount = publishedHubPageCount(collection);
        for (let page = 1; page <= pageCount; page++) {
          const reference = memberships.get(`en:${hubPath}:${page}`);
          for (const locale of CONTENT_LOCALES) {
            expect(memberships.get(`${locale}:${hubPath}:${page}`), `${locale} ${hubPath} page ${page}`).toEqual(
              reference,
            );
          }
        }
      }

      const malformed = await e2eResponse("/en/blog?page=2junk");
      await expectSemanticNotFound(malformed, "malformed page query", "en");
      const repeated = await e2eResponse("/en/blog?page=2&page=3");
      await expectSemanticNotFound(repeated, "repeated page query", "en");

      const appOnly = await e2eResponse("/fr/blog?page=1&utm_source=e2e");
      expect(appOnly.status).toBe(307);
      expect(sameOriginPath(appOnly.headers.get("location") ?? "", E2E_BASE_URL as string)).toBe(
        "/en/blog?page=1&utm_source=e2e",
      );
      const contentLocalePageOne = await e2eResponse("/en/blog?page=1&utm_source=e2e");
      expect(contentLocalePageOne.status, "content-locale page-one transport").toBe(308);
      const finalLocation = await semanticRedirectPath(contentLocalePageOne, "content-locale page one");
      expect(finalLocation).toBe("/en/blog?utm_source=e2e");
      await expectCanonicalResponse(await e2eResponse(finalLocation), "/en/blog", "app-only locale destination");

      for (let offset = 0; offset < details.length; offset += 16) {
        await Promise.all(
          details.slice(offset, offset + 16).map(async (detail) => {
            const response = await e2eResponse(detail);
            expect(response.status, detail).toBe(200);
          }),
        );
      }

      const sitemapResponse = await e2eResponse("/sitemap.xml");
      expect(sitemapResponse.status).toBe(200);
      const sitemap = await sitemapResponse.text();
      const sitemapDocument = new JSDOM(sitemap, {
        contentType: "application/xml",
      }).window.document;
      const sitemapPaths = [...sitemapDocument.querySelectorAll("loc")].map((loc) => {
        const url = new URL(loc.textContent ?? "");
        return `${url.pathname}${url.search}`;
      });
      const actualPaginatedPaths = sitemapPaths.filter((path) =>
        new URL(path, "https://sitemap.invalid").searchParams.has(HUB_PAGE_PARAM),
      );
      const expectedPaginatedPaths = CONTENT_LOCALES.flatMap((locale) =>
        LANDING_HUBS.flatMap(({ collection, hubPath }) => {
          const pageCount = hubPageCount(collectionSlugs(collection, locale).length);
          return Array.from({ length: pageCount - 1 }, (_, index) =>
            buildLocalePath(locale, hubPageHref(hubPath, index + 2)),
          );
        }),
      ).sort();

      expect(actualPaginatedPaths.sort()).toEqual(expectedPaginatedPaths);
      expect(new Set(actualPaginatedPaths).size).toBe(actualPaginatedPaths.length);
      expect(
        actualPaginatedPaths.some(
          (path) => new URL(path, "https://sitemap.invalid").searchParams.get(HUB_PAGE_PARAM) === "1",
        ),
      ).toBe(false);

      const robotsResponse = await e2eResponse("/robots.txt");
      expect(robotsResponse.status).toBe(200);
      const robots = await robotsResponse.text();
      expect(robots).not.toContain("Crawl-delay");
      const hostname = new URL(E2E_BASE_URL as string).hostname;
      if (hostname === "localhost" || /^127(?:\.\d{1,3}){3}$/u.test(hostname)) expect(robots).toContain("Allow: /");
      else expect(robots).toContain("Disallow: /");
      expect(maxCards).toBe(24);
      expect(maxHtmlBytes).toBeGreaterThan(0);
    },
    180_000,
  );
});
