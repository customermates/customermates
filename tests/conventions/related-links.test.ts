import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  RELATED_ROUTE_SEGMENTS,
  type RelatedRouteSegment,
  type RelatedTargetResolver,
  resolveRelatedTarget,
} from "@/components/marketing/related-target";
import { CONTENT_LOCALES } from "@/i18n/locale-registry";

import { REPO_ROOT, walkFiles } from "./walk";

const OUTBOUND_PER_PAGE = 4;

const COLLECTIONS = {
  "compare-pages": "/compare",
  "feature-pages": "/features",
  "for-pages": "/for",
} as const;

const TARGET_COLLECTIONS = {
  ...COLLECTIONS,
  "blog-posts": "/blog",
  docs: "/docs",
} as const;

type Entry = { hrefs: string[]; slug: string; source: string };

function entries(collection: string, locale: string): Entry[] {
  return walkFiles(join(REPO_ROOT, "content", collection, locale), (path) =>
    path.endsWith(".mdx"),
  ).map((path) => {
    const source = readFileSync(path, "utf8");
    const block = /<RelatedPages>([\s\S]*?)<\/RelatedPages>/u.exec(source);

    return {
      hrefs: block
        ? [...block[1].matchAll(/<RelatedPage\s+href="([^"]+)"\s*\/>/gu)].map(
            (match) => match[1],
          )
        : [],
      slug: basename(path, ".mdx"),
      source,
    };
  });
}

function publishedRoutes(locale: string) {
  return new Set(
    Object.entries(TARGET_COLLECTIONS).flatMap(([collection, base]) =>
      entries(collection, locale).map(({ slug }) => `${base}/${slug}`),
    ),
  );
}

describe("related links", () => {
  it("resolves every supported route family and rejects malformed or missing targets", () => {
    const alternativeTitle = (competitor: string) =>
      `Customermates alternative to ${competitor}`;
    const calls: string[] = [];
    const resolver =
      (segment: string): RelatedTargetResolver =>
      (slug, locale) => {
        calls.push(`${segment}:${slug}:${locale}`);
        return slug === "missing"
          ? null
          : {
              description: `${segment} description`,
              title: `${segment}:${slug}`,
            };
      };
    const resolvers = Object.fromEntries(
      RELATED_ROUTE_SEGMENTS.map((segment) => [segment, resolver(segment)]),
    ) as Record<RelatedRouteSegment, RelatedTargetResolver>;

    for (const segment of RELATED_ROUTE_SEGMENTS) {
      const target = resolveRelatedTarget(
        `/${segment}/example`,
        "en",
        alternativeTitle,
        resolvers,
      );
      expect(target.title).toBe(`${segment}:example`);
      expect(target.description.length).toBeGreaterThan(0);
    }
    expect(calls).toEqual(
      RELATED_ROUTE_SEGMENTS.map((segment) => `${segment}:example:en`),
    );

    for (const href of [
      "/docs/mcp/anything",
      "/docs",
      "/unknown/mcp",
      "docs/mcp",
    ])
      expect(() =>
        resolveRelatedTarget(href, "en", alternativeTitle, resolvers),
      ).toThrow("is not a related-page route");

    expect(() =>
      resolveRelatedTarget("/docs/missing", "en", alternativeTitle, resolvers),
    ).toThrow("resolves to no published page");
  });

  it("keeps every route family wired to its published content source", () => {
    const component = readFileSync(
      join(REPO_ROOT, "components/marketing/related-pages.tsx"),
      "utf8",
    );
    for (const segment of RELATED_ROUTE_SEGMENTS)
      expect(component, `${segment} resolver is missing`).toMatch(
        new RegExp(`^  ${segment}:`, "mu"),
      );
  });

  it("registers the components so MDX can resolve them", () => {
    // These are plain MDX components with no per-route wiring: an unregistered one renders as an
    // unknown tag rather than failing, so the block would silently vanish from every page.
    // Anchored to the returned map, not the file: the import line alone contains both names, so a
    // substring check passes even when the component was dropped from the registry object.
    const registry = readFileSync(
      join(REPO_ROOT, "core/fumadocs/mdx-components.tsx"),
      "utf8",
    );
    expect(
      registry,
      "RelatedPages is not in the returned component map",
    ).toMatch(/^\s+RelatedPages,$/mu);
    expect(
      registry,
      "RelatedPage is not in the returned component map",
    ).toMatch(/^\s+RelatedPage,$/mu);
  });

  it("gives every detail page four distinct, non-self links to published content", () => {
    for (const [collection, base] of Object.entries(COLLECTIONS)) {
      for (const locale of CONTENT_LOCALES) {
        const all = entries(collection, locale);
        const published = publishedRoutes(locale);
        const problems: string[] = [];

        for (const entry of all) {
          const where = `${collection}/${locale}/${entry.slug}`;
          if (entry.hrefs.length !== OUTBOUND_PER_PAGE)
            problems.push(
              `${where}: ${entry.hrefs.length} links, expected ${OUTBOUND_PER_PAGE}`,
            );
          if (new Set(entry.hrefs).size !== entry.hrefs.length)
            problems.push(`${where}: repeats a link`);

          for (const href of entry.hrefs) {
            if (!published.has(href))
              problems.push(`${where}: ${href} names no published page`);
            else if (href === `${base}/${entry.slug}`)
              problems.push(`${where}: links to itself`);
          }
        }

        expect(problems, problems.join("\n")).toEqual([]);
      }
    }
  });

  it("leaves no page without inbound links", () => {
    // 37 pages per locale received nothing before these blocks existed, which is the no_inlinks
    // finding. Adding a page without linking it from anywhere silently recreates that.
    for (const locale of CONTENT_LOCALES) {
      const inbound = new Map<string, number>(
        Object.entries(COLLECTIONS).flatMap(([collection, base]) =>
          entries(collection, locale).map(
            ({ slug }) => [`${base}/${slug}`, 0] as const,
          ),
        ),
      );

      for (const collection of Object.keys(COLLECTIONS))
        for (const entry of entries(collection, locale))
          for (const href of entry.hrefs)
            if (inbound.has(href))
              inbound.set(href, (inbound.get(href) ?? 0) + 1);

      const orphans = [...inbound]
        .filter(([, count]) => count === 0)
        .map(([href]) => `${locale}${href} is linked from nowhere`);

      expect(orphans, orphans.join("\n")).toEqual([]);
    }
  });

  it("keeps the link graph identical across locales", () => {
    for (const collection of Object.keys(COLLECTIONS)) {
      const [reference, ...others] = CONTENT_LOCALES.map((locale) => ({
        graph: Object.fromEntries(
          entries(collection, locale).map((entry) => [entry.slug, entry.hrefs]),
        ),
        locale,
      }));

      for (const other of others)
        expect(
          other.graph,
          `${collection} differs between ${reference.locale} and ${other.locale}`,
        ).toEqual(reference.graph);
    }
  });
});
