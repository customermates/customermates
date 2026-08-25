import { readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import { resolveCommercialTokens } from "@/core/commercial/commercial-tokens";
import { resolveDerivedTokens } from "@/core/content/derived-tokens";
import type { ContentLocale } from "@/i18n/locale-registry";

import { CONTENT_LOCALES } from "@/i18n/locale-registry";

import { REPO_ROOT, walkFiles } from "./walk";

const TITLE_LIMIT = 60;
const DESCRIPTION_LIMIT = 160;

// A paginated hub appends " - Page 2" to its own title, so its base has to leave room or the
// page-2 URL is over the limit while the page-1 URL looks fine.
const PAGE_SUFFIX_ALLOWANCE = 9;
const PAGINATED_HUB_COLLECTIONS = new Set(["blog", "compare", "features-all", "for"]);

// /docs/openapi/* and the auth routes ship noindex and are not in the sitemap, so their titles
// and descriptions are never shown in a search result.
const NOINDEX_COLLECTIONS = new Set(["api", "auth"]);

function rendered(value: string, locale: string): string {
  return resolveDerivedTokens(resolveCommercialTokens(value, locale));
}

type Meta = { collection: string; description: string; locale: string; path: string; title: string };

function contentMeta(): Meta[] {
  const found: Meta[] = [];

  for (const path of walkFiles(join(REPO_ROOT, "content"), (file) => file.endsWith(".mdx"))) {
    const parts = relative(join(REPO_ROOT, "content"), path).split("/");
    const [collection, locale] = parts;

    if (NOINDEX_COLLECTIONS.has(collection)) continue;
    if (!CONTENT_LOCALES.includes(locale as ContentLocale)) continue;

    const frontmatter = /^---\n(.*?)\n---/s.exec(readFileSync(path, "utf8"));
    if (!frontmatter) continue;

    const data = parse(frontmatter[1]) as {
      description?: string;
      rootMetadata?: { defaultDescription?: string; defaultTitle?: string };
      title?: string;
    };

    // The homepage's own title and description never reach a meta tag: generateMetadata reads
    // rootMetadata, and the top-level description feeds the softwareApplication JSON-LD, which has
    // no snippet limit. Measuring the wrong pair here passes a broken homepage and fails a fine one.
    const title = collection === "homepage" ? data.rootMetadata?.defaultTitle : data.title;
    const description = collection === "homepage" ? data.rootMetadata?.defaultDescription : data.description;

    if (!title) continue;

    found.push({
      collection,
      description: rendered(description ?? "", locale),
      locale,
      path,
      title: rendered(title, locale),
    });
  }

  return found;
}

const META = contentMeta();

function limitFor(collection: string): number {
  return PAGINATED_HUB_COLLECTIONS.has(collection) ? TITLE_LIMIT - PAGE_SUFFIX_ALLOWANCE : TITLE_LIMIT;
}

describe("seo metadata length", () => {
  it("reads a meaningful number of pages", () => {
    expect(META.length, "the scan found almost nothing, so the assertions below prove nothing").toBeGreaterThan(350);
  });

  it("keeps every title within what a search result renders", () => {
    // Lengths are measured with commercial tokens resolved: the source
    // [[commercial.price.starter.monthly]] is 36 characters but renders as "12 €", so counting the
    // raw frontmatter flags pages that are actually fine and misses ones that are not.
    const over = META.filter((page) => page.title.length > limitFor(page.collection)).map(
      (page) =>
        `${relative(REPO_ROOT, page.path)}: title is ${page.title.length}, limit ${limitFor(page.collection)}`,
    );

    expect(over, over.join("\n")).toEqual([]);
  });

  it("keeps every description within what a search result renders", () => {
    const over = META.filter((page) => page.description.length > DESCRIPTION_LIMIT).map(
      (page) => `${relative(REPO_ROOT, page.path)}: description is ${page.description.length}, limit ${DESCRIPTION_LIMIT}`,
    );

    expect(over, over.join("\n")).toEqual([]);
  });

  it("gives every page a description to render", () => {
    const missing = META.filter((page) => page.description.trim().length === 0).map((page) =>
      relative(REPO_ROOT, page.path),
    );

    expect(missing, "a page with no description lets Google invent one").toEqual([]);
  });

  it("never ships the same title twice in one locale", () => {
    // Two pages under one title compete for the same result and split their own signals, which is
    // the duplicate_title finding the audit raised.
    for (const locale of CONTENT_LOCALES) {
      const seen = new Map<string, string>();
      const collisions: string[] = [];

      for (const page of META.filter((entry) => entry.locale === locale)) {
        const previous = seen.get(page.title);
        if (previous) collisions.push(`${page.title}: ${previous} and ${relative(REPO_ROOT, page.path)}`);
        else seen.set(page.title, relative(REPO_ROOT, page.path));
      }

      expect(collisions, collisions.join("\n")).toEqual([]);
    }
  });

  it("writes no em dash or en dash into a title or description", () => {
    const offenders = META.filter((page) => /[–—]/.test(`${page.title} ${page.description}`)).map((page) =>
      relative(REPO_ROOT, page.path),
    );

    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
