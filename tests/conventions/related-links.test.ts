import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONTENT_LOCALES } from "@/i18n/locale-registry";

import { REPO_ROOT, walkFiles } from "./walk";

const OUTBOUND_PER_PAGE = 4;

const COLLECTIONS = {
  "compare-pages": "/compare",
  "feature-pages": "/features",
  "for-pages": "/for",
} as const;

type Entry = { hrefs: string[]; slug: string; source: string };

function entries(collection: string, locale: string): Entry[] {
  return walkFiles(join(REPO_ROOT, "content", collection, locale), (path) => path.endsWith(".mdx")).map((path) => {
    const source = readFileSync(path, "utf8");
    const block = /<RelatedPages>([\s\S]*?)<\/RelatedPages>/u.exec(source);

    return {
      hrefs: block ? [...block[1].matchAll(/<RelatedPage\s+href="([^"]+)"\s*\/>/gu)].map((match) => match[1]) : [],
      slug: basename(path, ".mdx"),
      source,
    };
  });
}

describe("related links", () => {
  it("registers the components so MDX can resolve them", () => {
    // These are plain MDX components with no per-route wiring: an unregistered one renders as an
    // unknown tag rather than failing, so the block would silently vanish from every page.
    // Anchored to the returned map, not the file: the import line alone contains both names, so a
    // substring check passes even when the component was dropped from the registry object.
    const registry = readFileSync(join(REPO_ROOT, "core/fumadocs/mdx-components.tsx"), "utf8");
    expect(registry, "RelatedPages is not in the returned component map").toMatch(/^\s+RelatedPages,$/mu);
    expect(registry, "RelatedPage is not in the returned component map").toMatch(/^\s+RelatedPage,$/mu);
  });

  it("gives every detail page a full block of distinct, non-self links", () => {
    for (const [collection, base] of Object.entries(COLLECTIONS)) {
      for (const locale of CONTENT_LOCALES) {
        const all = entries(collection, locale);
        const published = new Set(all.map((entry) => entry.slug));
        const problems: string[] = [];

        for (const entry of all) {
          const where = `${collection}/${locale}/${entry.slug}`;
          if (entry.hrefs.length !== OUTBOUND_PER_PAGE)
            problems.push(`${where}: ${entry.hrefs.length} links, expected ${OUTBOUND_PER_PAGE}`);
          if (new Set(entry.hrefs).size !== entry.hrefs.length) problems.push(`${where}: repeats a link`);

          for (const href of entry.hrefs) {
            const slug = href.slice(`${base}/`.length);
            if (!href.startsWith(`${base}/`)) problems.push(`${where}: ${href} leaves its own collection`);
            else if (!published.has(slug)) problems.push(`${where}: ${href} names no published page`);
            else if (slug === entry.slug) problems.push(`${where}: links to itself`);
          }
        }

        expect(problems, problems.join("\n")).toEqual([]);
      }
    }
  });

  it("leaves no page without inbound links", () => {
    // 37 pages per locale received nothing before these blocks existed, which is the no_inlinks
    // finding. Adding a page without linking it from anywhere silently recreates that.
    for (const [collection, base] of Object.entries(COLLECTIONS)) {
      for (const locale of CONTENT_LOCALES) {
        const all = entries(collection, locale);
        const inbound = new Map(all.map((entry) => [entry.slug, 0]));

        for (const entry of all)
          for (const href of entry.hrefs) {
            const slug = href.slice(`${base}/`.length);
            if (inbound.has(slug)) inbound.set(slug, (inbound.get(slug) ?? 0) + 1);
          }

        const orphans = [...inbound]
          .filter(([, count]) => count === 0)
          .map(([slug]) => `${collection}/${locale}/${slug} is linked from nowhere`);

        expect(orphans, orphans.join("\n")).toEqual([]);
      }
    }
  });

  it("keeps the link graph identical across locales", () => {
    for (const collection of Object.keys(COLLECTIONS)) {
      const [reference, ...others] = CONTENT_LOCALES.map((locale) => ({
        graph: Object.fromEntries(entries(collection, locale).map((entry) => [entry.slug, entry.hrefs])),
        locale,
      }));

      for (const other of others)
        expect(other.graph, `${collection} differs between ${reference.locale} and ${other.locale}`).toEqual(
          reference.graph,
        );
    }
  });
});
