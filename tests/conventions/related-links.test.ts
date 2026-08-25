import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import { RELATED_PAGE_LINK_COUNT, planRelatedLinks } from "@/core/seo/related-selection";
import { CONTENT_LOCALES } from "@/i18n/locale-registry";

import { REPO_ROOT, walkFiles } from "./walk";

const COLLECTIONS = {
  "compare-pages": "app/[locale]/(static)/compare/[competitor]/page.tsx",
  "feature-pages": "app/[locale]/(static)/features/[slug]/page.tsx",
  "for-pages": "app/[locale]/(static)/for/[industry]/page.tsx",
} as const;

type Entry = { curated: string[]; slug: string; source: string };

function entries(collection: string, locale: string): Entry[] {
  const directory = join(REPO_ROOT, "content", collection, locale);

  return walkFiles(directory, (path) => path.endsWith(".mdx")).map((path) => {
    const source = readFileSync(path, "utf8");
    const frontmatter = /^---\n(.*?)\n---/s.exec(source);
    const data = frontmatter ? (parse(frontmatter[1]) as { related?: string[] }) : {};

    return { curated: data.related ?? [], slug: basename(path, ".mdx"), source };
  });
}

describe("related links", () => {
  it("renders the slot on every detail page", () => {
    // The plan guarantees inbound coverage only if every page in the collection emits its own
    // outbound links. A page that omits the component is silently removed from the graph.
    for (const collection of Object.keys(COLLECTIONS)) {
      for (const locale of CONTENT_LOCALES) {
        const missing = entries(collection, locale)
          .filter((entry) => !entry.source.includes("<RelatedPages />"))
          .map((entry) => `${collection}/${locale}/${entry.slug}`);
        expect(missing, "these pages render no related links").toEqual([]);
      }
    }
  });

  it("wires the slot in the page that renders each collection", () => {
    // RelatedPages is not in the shared MDX registry: it needs the current slug, so each route
    // supplies it. An unwired collection renders the tag as an unknown element.
    for (const [collection, page] of Object.entries(COLLECTIONS)) {
      const source = readFileSync(join(REPO_ROOT, page), "utf8");
      expect(source, `${collection} renders <RelatedPages /> but never provides it`).toContain(
        `relatedPagesSlot("${collection}"`,
      );
    }
  });

  it("curates only slugs that are published in the same collection", () => {
    // These links used to be root-relative MDX anchors, which internal-link-targets.test.ts
    // validated. They now live in frontmatter, where that test cannot see them.
    for (const collection of Object.keys(COLLECTIONS)) {
      for (const locale of CONTENT_LOCALES) {
        const all = entries(collection, locale);
        const published = new Set(all.map((entry) => entry.slug));
        const broken = all.flatMap((entry) =>
          entry.curated
            .filter((slug) => !published.has(slug) || slug === entry.slug)
            .map((slug) => `${collection}/${locale}/${entry.slug} -> ${slug}`),
        );
        expect(broken, "a curated slug names no published page in its own locale").toEqual([]);
      }
    }
  });

  it("keeps the curated cluster identical across locales", () => {
    // Slugs are locale-independent, so a divergence means one locale was edited and the other was
    // not, which silently gives the two trees different link graphs.
    for (const collection of Object.keys(COLLECTIONS)) {
      const [reference, ...others] = CONTENT_LOCALES.map((locale) => ({
        graph: Object.fromEntries(entries(collection, locale).map((entry) => [entry.slug, entry.curated])),
        locale,
      }));

      for (const other of others) {
        expect(other.graph, `${collection} differs between ${reference.locale} and ${other.locale}`).toEqual(
          reference.graph,
        );
      }
    }
  });

  it("leaves no page without inbound links", () => {
    // The defect this whole component exists to fix: 37 pages per locale received no related link
    // at all, which is SE Ranking's no_inlinks finding.
    for (const collection of Object.keys(COLLECTIONS)) {
      for (const locale of CONTENT_LOCALES) {
        const all = entries(collection, locale);
        const plan = planRelatedLinks(all.map(({ curated, slug }) => ({ curated, slug })));
        const inbound = new Map(all.map((entry) => [entry.slug, 0]));

        for (const links of plan.values()) {
          for (const slug of links) inbound.set(slug, (inbound.get(slug) ?? 0) + 1);
        }

        const orphans = [...inbound].filter(([, count]) => count === 0).map(([slug]) => `${collection}/${locale}/${slug}`);
        expect(orphans, "these pages receive no related link from anywhere").toEqual([]);

        for (const [slug, links] of plan) {
          expect(links.length, `${collection}/${locale}/${slug} emits too few links`).toBe(RELATED_PAGE_LINK_COUNT);
          expect(new Set(links).size, `${collection}/${locale}/${slug} repeats a link`).toBe(links.length);
        }
      }
    }
  });
});
