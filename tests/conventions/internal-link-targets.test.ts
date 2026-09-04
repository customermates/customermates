import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

import {
  FOOTER_COLUMN_SIZE,
  FOOTER_PREFERRED_SLUGS,
  type FooterCollection,
  selectFooterSlugs,
} from "@/app/components/footer-selection";
import { ROUTE_SOURCE_MAP } from "@/core/fumadocs/route-source-map";
import {
  HUB_PAGE_PARAM,
  hubPageCount,
  resolveHubPage,
} from "@/core/seo/hub-pagination";
import { LANDING_HUBS } from "@/core/seo/landing-hubs";
import {
  CONTENT_LOCALES,
  DEFAULT_LOCALE,
  type ContentLocale,
  type RoutingLocale,
  isContentLocale,
  routingLocaleFromUrlSegment,
} from "@/i18n/locale-registry";
import { PUBLIC_ROUTES } from "@/i18n/routing";

vi.mock("@/core/fumadocs/source", async () => {
  const { existsSync, readdirSync } = await import("node:fs");
  const { extname, join } = await import("node:path");

  const source = (collection: string, basePath: string) => ({
    getPage(path: string[], locale: string) {
      const slug = path.at(-1);
      return slug &&
        existsSync(
          join(process.cwd(), "content", collection, locale, `${slug}.mdx`),
        )
        ? { url: `${basePath}/${slug}`.replace(/^\/{2,}/u, "/") }
        : undefined;
    },
    getPages(locale: string) {
      const directory = join(process.cwd(), "content", collection, locale);
      if (!existsSync(directory)) return [];
      return readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && extname(entry.name) === ".mdx")
        .map((entry) => ({
          url: `${basePath}/${entry.name.slice(0, -".mdx".length)}`.replace(
            /^\/{2,}/u,
            "/",
          ),
        }));
    },
  });

  return {
    affiliateSource: source("affiliate", ""),
    apiDocsSource: source("api", "/docs/openapi"),
    apiOverviewSource: source("api-overview", "/docs/openapi"),
    authSource: source("auth", "/auth"),
    automationSource: source("automation", "/n8n-crm"),
    blogPostsSource: source("blog-posts", "/blog"),
    blogSource: source("blog", ""),
    comparePagesSource: source("compare-pages", "/compare"),
    compareSource: source("compare", ""),
    contactSource: source("contact", ""),
    docsSource: source("docs", "/docs"),
    featurePagesSource: source("feature-pages", "/features"),
    featuresAllSource: source("features-all", "/features"),
    featuresSource: source("features", ""),
    forPagesSource: source("for-pages", "/for"),
    forSource: source("for", ""),
    helpAndFeedbackSource: source("help-and-feedback", ""),
    homepageSource: source("homepage", ""),
    legalSource: source("legal", ""),
    pricingSource: source("pricing", ""),
  };
});

const CONTENT_ROOT = join(REPO_ROOT, "content");
const CODE_BACKED_ROUTE_FILES = {
  "/styleguide": "app/[locale]/(static)/styleguide/page.tsx",
  "/styleguide/foundations": "app/[locale]/(static)/styleguide/foundations/page.tsx",
  "/styleguide/patterns": "app/[locale]/(static)/styleguide/patterns/page.tsx",
  "/styleguide/visuals": "app/[locale]/(static)/styleguide/visuals/page.tsx",
  "/auth/pending": "app/[locale]/(public)/auth/pending/page.tsx",
  "/auth/error": "app/[locale]/(public)/auth/error/page.tsx",
  "/auth/verify-email": "app/[locale]/(public)/auth/verify-email/page.tsx",
  "/auth/invitation": "app/[locale]/(public)/auth/invitation/page.tsx",
  "/invitation/:token": "app/[locale]/(public)/invitation/[token]/route.ts",
} as const;
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u;
const FRONTMATTER_HREF = /^\s*(?:-\s*)?([a-z0-9_-]*href)\s*:\s*(.*?)\s*$/iu;
const JSX_HREF =
  /\bhref\s*=\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|\{\s*"([^"\r\n]*)"\s*\}|\{\s*'([^'\r\n]*)'\s*\})/gu;
const MARKDOWN_LINK =
  /(?<!!)\[[^\]\r\n]*\]\(\s*(?:<([^>\r\n]+)>|((?:\\.|[^)\\\s])+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/gu;
const MARKDOWN_DEFINITION = /^\s*\[[^\]\r\n]+\]:\s*(?:<([^>\r\n]+)>|(\S+))/gmu;

type ContentLink = {
  file: string;
  line: number;
  sourceLocale: ContentLocale;
  target: string;
};

type NormalizedTarget = {
  locale: RoutingLocale | null;
  path: string;
  query: string;
};

type ContentSource = {
  getPage(path: string[], locale: string): unknown;
  getPages(locale: string): readonly { url: string }[];
};

function rootRelative(target: string | null | undefined): target is string {
  return (
    typeof target === "string" &&
    target.startsWith("/") &&
    !target.startsWith("//")
  );
}

function lineAt(source: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index++)
    if (source.charCodeAt(index) === 10) line++;
  return line;
}

function yamlString(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  if (value.startsWith('"')) {
    const match = /^"((?:\\.|[^"\\])*)"/u.exec(value);
    if (!match) return null;
    try {
      return JSON.parse(`"${match[1]}"`) as string;
    } catch {
      return null;
    }
  }

  if (value.startsWith("'")) {
    const match = /^'((?:''|[^'])*)'/u.exec(value);
    return match ? match[1].replaceAll("''", "'") : null;
  }

  return value.replace(/\s+#.*$/u, "").trim() || null;
}

function frontmatterHref(raw: string, file: string, line: number): string {
  const value = raw.trim();
  const unsupported =
    !value ||
    /^[>|*&!\[{]/u.test(value) ||
    /^(?:null|~)(?:\s+#.*)?$/iu.test(value);
  const parsed = unsupported ? null : yamlString(raw);

  if (parsed === null) {
    throw new Error(`${file}:${line} uses unsupported frontmatter href syntax`);
  }

  return parsed;
}

function linksInDocument(
  source: string,
  file: string,
  sourceLocale: ContentLocale,
): ContentLink[] {
  const links: ContentLink[] = [];
  const seen = new Set<string>();
  const record = (target: string | null | undefined, line: number) => {
    if (!rootRelative(target)) return;
    const key = `${line}\0${target}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ file, line, sourceLocale, target });
  };

  const frontmatter = FRONTMATTER.exec(source);
  if (frontmatter) {
    const firstLine = lineAt(source, frontmatter.index) + 1;
    for (const [index, line] of frontmatter[1].split(/\r?\n/u).entries()) {
      const field = FRONTMATTER_HREF.exec(line);
      if (field) {
        const lineNumber = firstLine + index;
        record(frontmatterHref(field[2], file, lineNumber), lineNumber);
      }
    }
  }

  // Mask frontmatter without changing offsets so prose and JSX line numbers
  // still point at the original source file.
  const body = frontmatter
    ? source.replace(FRONTMATTER, (value) => value.replace(/[^\r\n]/gu, " "))
    : source;

  for (const match of body.matchAll(MARKDOWN_LINK))
    record(match[1] ?? match[2], lineAt(body, match.index ?? 0));
  for (const match of body.matchAll(MARKDOWN_DEFINITION))
    record(match[1] ?? match[2], lineAt(body, match.index ?? 0));
  for (const match of body.matchAll(JSX_HREF))
    record(
      match[1] ?? match[2] ?? match[3] ?? match[4],
      lineAt(body, match.index ?? 0),
    );

  return links;
}

export function normalizeTarget(target: string): NormalizedTarget | null {
  const base = "https://internal.invalid";
  const url = new URL(target, base);
  if (url.origin !== base) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  const prefixedLocale = segments[0]
    ? routingLocaleFromUrlSegment(segments[0])
    : null;
  if (prefixedLocale) segments.shift();

  const path = segments.length === 0 ? "/" : `/${segments.join("/")}`;
  return {
    locale: prefixedLocale,
    path: path.length > 1 ? path.replace(/\/+$/u, "") : path,
    query: url.search,
  };
}

function contentBackedTargets(locale: ContentLocale): Set<string> {
  const targets = new Set<string>(
    Object.keys(CODE_BACKED_ROUTE_FILES).filter(
      (route) => !route.includes(":"),
    ),
  );

  for (const [route, routeMapping] of Object.entries(ROUTE_SOURCE_MAP)) {
    const { path, source } = routeMapping as {
      path: string[];
      source: ContentSource;
    };

    if (route.includes(":")) {
      for (const page of source.getPages(locale)) {
        const target = normalizeTarget(page.url);
        if (target) targets.add(target.path);
      }
    } else if (source.getPage(path, locale)) {
      targets.add(route);
    }
  }

  return targets;
}

function hasValidHubQuery(target: NormalizedTarget): boolean {
  const hub = LANDING_HUBS.find(({ hubPath }) => hubPath === target.path);
  if (!hub) return true;

  const params = new URLSearchParams(target.query);
  if (!params.has(HUB_PAGE_PARAM)) return true;
  const values = params.getAll(HUB_PAGE_PARAM);
  const raw = values.length === 1 ? values[0] : values;
  const pageCount = hubPageCount(
    collectionSlugs(hub.collection, DEFAULT_LOCALE).length,
  );
  return resolveHubPage(raw, pageCount).kind === "page";
}

function matchesCodeBackedRoute(path: string): boolean {
  return Object.keys(CODE_BACKED_ROUTE_FILES).some((route) => {
    const pattern = route
      .replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
      .replace(/:[a-z0-9_]+/giu, "[^/]+");
    return new RegExp(`^${pattern}$`, "u").test(path);
  });
}

function targetResolves(
  target: string,
  sourceLocale: ContentLocale,
  targetsByLocale: Map<ContentLocale, Set<string>>,
) {
  const normalized = normalizeTarget(target);
  if (!normalized) return true;
  if (normalized.locale && !isContentLocale(normalized.locale)) return false;
  const targetLocale = normalized.locale ?? sourceLocale;
  const published =
    targetsByLocale.get(targetLocale)?.has(normalized.path) ||
    matchesCodeBackedRoute(normalized.path);
  return Boolean(published && hasValidHubQuery(normalized));
}

function contentLinks(): ContentLink[] {
  const found: ContentLink[] = [];

  for (const path of walkFiles(
    CONTENT_ROOT,
    (candidate) => extname(candidate) === ".mdx",
  )) {
    const source = readFileSync(path, "utf8");
    const file = relative(REPO_ROOT, path).split(sep).join("/");
    const localeSegment = relative(CONTENT_ROOT, path).split(sep)[1];
    if (!isContentLocale(localeSegment))
      throw new Error(`${file} is outside a registered content locale`);
    found.push(...linksInDocument(source, file, localeSegment));
  }

  return found;
}

function collectionSlugs(collection: string, locale: ContentLocale): string[] {
  const directory = join(CONTENT_ROOT, collection, locale);
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name) === ".mdx")
    .map((entry) => entry.name.slice(0, -".mdx".length))
    .sort();
}

describe("internal link targets", () => {
  it("accounts for every public route at one explicit content-or-code contract", () => {
    const mapped = Object.keys(ROUTE_SOURCE_MAP);
    const codeBacked = Object.keys(CODE_BACKED_ROUTE_FILES);

    expect([...mapped, ...codeBacked].sort()).toEqual(
      [...PUBLIC_ROUTES].sort(),
    );
    for (const file of Object.values(CODE_BACKED_ROUTE_FILES)) {
      expect(
        existsSync(join(REPO_ROOT, file)),
        `${file} does not back its declared public route`,
      ).toBe(true);
    }
  });

  it("resolves every literal internal link in MDX, including frontmatter CTAs", () => {
    const links = contentLinks();
    const targetsByLocale = new Map(
      CONTENT_LOCALES.map((locale) => [locale, contentBackedTargets(locale)]),
    );
    const problems = links
      .filter(
        (link) =>
          !targetResolves(link.target, link.sourceLocale, targetsByLocale),
      )
      .map((link) => `${link.file}:${link.line} -> ${link.target}`);

    expect(
      links.length,
      "expected root-relative links under content/",
    ).toBeGreaterThan(0);
    expect(
      problems,
      `content links with no published route:\n${problems.join("\n")}`,
    ).toEqual([]);
  }, 30_000);

  it("derives six live footer links per collection and locale", () => {
    const selections = new Map<string, string[]>();
    const problems: string[] = [];

    for (const collection of Object.keys(
      FOOTER_PREFERRED_SLUGS,
    ) as FooterCollection[]) {
      for (const locale of CONTENT_LOCALES) {
        const published = collectionSlugs(collection, locale);
        const selected = selectFooterSlugs(collection, published);
        selections.set(`${collection}/${locale}`, selected);

        if (selected.length !== FOOTER_COLUMN_SIZE) {
          problems.push(
            `${collection}/${locale} yields ${selected.length}, expected ${FOOTER_COLUMN_SIZE}`,
          );
        }
        for (const slug of selected) {
          if (!published.includes(slug))
            problems.push(
              `${collection}/${locale} selected absent slug ${slug}`,
            );
        }
      }

      const reference = selections.get(`${collection}/${DEFAULT_LOCALE}`);
      for (const locale of CONTENT_LOCALES)
        expect(selections.get(`${collection}/${locale}`)).toEqual(reference);
    }

    expect(
      problems,
      `footer columns with invalid derived links:\n${problems.join("\n")}`,
    ).toEqual([]);
  });

  it("prioritizes the approved acquisition pages in their footer columns", () => {
    expect(FOOTER_PREFERRED_SLUGS["blog-posts"].slice(0, 2)).toEqual([
      "agentic-crm",
      "open-source-crm",
    ]);
    expect(FOOTER_PREFERRED_SLUGS["feature-pages"].slice(0, 2)).toEqual([
      "self-hosted",
      "unified-inbox",
    ]);
    expect(FOOTER_PREFERRED_SLUGS["for-pages"].slice(0, 2)).toEqual([
      "professional-services",
      "agencies",
    ]);
  });

  it("tops up a footer column deterministically when a preferred page disappears", () => {
    const preferred = FOOTER_PREFERRED_SLUGS["for-pages"];
    const available = [
      ...preferred.slice(1),
      "zzz-replacement",
      "aaa-replacement",
    ];

    expect(selectFooterSlugs("for-pages", available)).toEqual([
      ...preferred.slice(1),
      "aaa-replacement",
    ]);
    expect(selectFooterSlugs("for-pages", preferred.slice(0, 2))).toEqual([
      ...preferred.slice(0, 2),
    ]);
  });

  it("extracts literal Markdown, JSX, and frontmatter hrefs without a parser dependency", () => {
    const links = linksInDocument(
      `---\nbuttonLeftHref: /pricing\nnestedButtonHref: '/blog?page=2'\n---\n[inline](/pricing)\n\n[plans]: /pricing#plans\n\n<Card\n  href={'/features/all'}\n/>`,
      "synthetic.mdx",
      DEFAULT_LOCALE,
    );

    expect(links.map(({ target }) => target)).toEqual([
      "/pricing",
      "/blog?page=2",
      "/pricing",
      "/pricing#plans",
      "/features/all",
    ]);
  });

  it("fails closed on frontmatter href syntax the bounded scanner cannot interpret", () => {
    expect(() =>
      linksInDocument(
        `---\nbuttonHref: >-\n  /missing\n---`,
        "folded.mdx",
        DEFAULT_LOCALE,
      ),
    ).toThrow("folded.mdx:2 uses unsupported frontmatter href syntax");
    expect(() =>
      linksInDocument(
        `---\nbuttonHref: *shared-target\n---`,
        "alias.mdx",
        DEFAULT_LOCALE,
      ),
    ).toThrow("alias.mdx:2 uses unsupported frontmatter href syntax");
  });

  it("does not backtrack through a long malformed Markdown escape sequence", () => {
    const malformed = `[broken](/${"\\".repeat(4_096)}`;
    expect(linksInDocument(malformed, "malformed.mdx", DEFAULT_LOCALE)).toEqual(
      [],
    );
  });

  it("keeps hub query semantics instead of discarding the page parameter", () => {
    const targetsByLocale = new Map(
      CONTENT_LOCALES.map((locale) => [locale, contentBackedTargets(locale)]),
    );

    expect(
      targetResolves("/blog?page=2", DEFAULT_LOCALE, targetsByLocale),
    ).toBe(true);
    expect(
      targetResolves("/blog?page=1", DEFAULT_LOCALE, targetsByLocale),
    ).toBe(false);
    expect(
      targetResolves("/blog?page=99", DEFAULT_LOCALE, targetsByLocale),
    ).toBe(false);
    expect(
      targetResolves("/blog?page=2&page=3", DEFAULT_LOCALE, targetsByLocale),
    ).toBe(false);
    expect(targetResolves("/contact", DEFAULT_LOCALE, targetsByLocale)).toBe(
      true,
    );
    expect(targetResolves("/fr/pricing", DEFAULT_LOCALE, targetsByLocale)).toBe(
      false,
    );
  });

  it("normalizes locale prefixes, fragments, and trailing slashes without losing queries", () => {
    expect(normalizeTarget("/pricing#plans")).toEqual({
      locale: null,
      path: "/pricing",
      query: "",
    });
    expect(normalizeTarget("/pricing?ref=footer")).toEqual({
      locale: null,
      path: "/pricing",
      query: "?ref=footer",
    });
    expect(normalizeTarget("/for/healthcare/")).toEqual({
      locale: null,
      path: "/for/healthcare",
      query: "",
    });
    expect(normalizeTarget("/de/for/healthcare")).toEqual({
      locale: "de",
      path: "/for/healthcare",
      query: "",
    });
    expect(normalizeTarget("/fr/pricing")).toEqual({
      locale: "fr",
      path: "/pricing",
      query: "",
    });
    expect(normalizeTarget("/")).toEqual({
      locale: null,
      path: "/",
      query: "",
    });
  });
});
