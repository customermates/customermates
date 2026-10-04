import type { WikiBenchmarkCategory, WikiBenchmarkPage, WikiBenchmarkQueryLanguage } from "../wiki-retrieval-benchmark";

import { describe, expect, it } from "vitest";

import { loadWikiRetrievalBenchmark, wikiBenchmarkSections } from "../wiki-retrieval-benchmark";

const { pages, queries } = loadWikiRetrievalBenchmark();

// Function words of four or more letters in the five query languages. Content words never belong here: a paraphrase
// that shares a content word with its target must be rewritten, not whitelisted.
const STOPWORDS = new Set(
  [
    // English
    "about after also been before because could does from have into just more most only should some than " +
      "that their them then there they this what when where which while whether will with would your",
    // German
    "aber alle auch beim dann dass diese dieser eine einem einen einer eines habe haben kann meine meinen " +
      "meiner muss nach nicht noch oder sich soll sind ueber uber wann warum weil welche welchem welcher " +
      "wenn werden wird wurde will",
    // Spanish
    "como cual cuando donde esta este para pero porque tiene tengo tenemos",
    // French
    "avec dans elle leur mais pour quand quel quelle quelles quels sont sous",
    // Italian
    "come della delle dopo nella nelle perche quando sono",
  ]
    .join(" ")
    .split(" "),
);

function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function tokens(text: string): string[] {
  return fold(text)
    .split(/[^\p{L}]+/u)
    .filter((token) => token.length > 0);
}

function contentWords(text: string): Set<string> {
  return new Set(tokens(text).filter((token) => token.length >= 4 && !STOPWORDS.has(token)));
}

function wordCount(markdown: string): number {
  return markdown.split(/\s+/u).filter((word) => /\p{L}/u.test(word)).length;
}

const pageBySlug = new Map<string, WikiBenchmarkPage>(pages.map((page) => [page.slug, page]));

function sectionText(slug: string, heading: string): string {
  const page = pageBySlug.get(slug);
  const section = page ? wikiBenchmarkSections(page.markdown).find((entry) => entry.heading === heading) : undefined;
  if (!page || !section) throw new Error(`missing section ${slug}#${heading}`);
  return `${page.title}\n${section.heading}\n${section.text}`;
}

const corpusVocabulary = new Set(
  pages.flatMap((page) => tokens(`${page.title}\n${page.whenToUse ?? ""}\n${page.markdown}`)),
);

function countBy<T extends string>(values: readonly T[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

describe("wiki retrieval benchmark corpus", () => {
  it("has about 40 unique pages, 25 German and 15 English", () => {
    expect(new Set(pages.map((page) => page.slug)).size).toBe(pages.length);
    expect(new Set(pages.map((page) => page.title)).size).toBe(pages.length);
    expect(countBy(pages.map((page) => page.language))).toEqual({ de: 25, en: 15 });
  });

  it("has one Operating Guide and about eight procedures, each procedure with whenToUse", () => {
    const kinds = countBy(pages.map((page) => page.kind));
    expect(kinds.guide).toBe(1);
    expect(kinds.procedure).toBeGreaterThanOrEqual(8);
    expect(kinds.procedure).toBeLessThanOrEqual(10);
    for (const page of pages) {
      if (page.kind === "procedure") expect(page.whenToUse, page.slug).toBeTruthy();
      else expect(page.whenToUse, page.slug).toBeNull();
    }
  });

  it("gives every page 150 to 900 words and at least four uniquely named sections", () => {
    for (const page of pages) {
      const words = wordCount(page.markdown);
      expect(words, `${page.slug} word count`).toBeGreaterThanOrEqual(150);
      expect(words, `${page.slug} word count`).toBeLessThanOrEqual(900);
      const headings = wikiBenchmarkSections(page.markdown).map((section) => section.heading);
      expect(headings.length, page.slug).toBeGreaterThanOrEqual(4);
      expect(new Set(headings).size, page.slug).toBe(headings.length);
      for (const section of wikiBenchmarkSections(page.markdown))
        expect(section.text.length, `${page.slug}#${section.heading}`).toBeGreaterThan(0);
    }
  });
});

describe("wiki retrieval benchmark queries", () => {
  it("has unique ids and no duplicate query text", () => {
    expect(new Set(queries.map((query) => query.id)).size).toBe(queries.length);
    expect(new Set(queries.map((query) => fold(query.query).replace(/\s+/gu, " ").trim())).size).toBe(queries.length);
  });

  it("meets the category and language targets", () => {
    expect(queries.length).toBeGreaterThanOrEqual(150);
    expect(queries.length).toBeLessThanOrEqual(170);
    const minimum: Record<WikiBenchmarkCategory, number> = {
      lexical: 38,
      paraphrase: 43,
      "cross-language": 38,
      typo: 14,
      "multi-hop": 9,
      "no-match": 9,
    };
    const categories = countBy(queries.map((query) => query.category));
    for (const [category, count] of Object.entries(minimum))
      expect(categories[category] ?? 0, category).toBeGreaterThanOrEqual(count);
    const languages = countBy(queries.map((query) => query.language));
    const languageMinimum: Record<WikiBenchmarkQueryLanguage, number> = { de: 30, en: 30, es: 10, fr: 10, it: 10 };
    for (const [language, count] of Object.entries(languageMinimum))
      expect(languages[language] ?? 0, language).toBeGreaterThanOrEqual(count);
  });

  it("points every gold label at an existing page section, and no-match queries at nothing", () => {
    for (const query of queries) {
      if (query.category === "no-match") {
        expect(query.targets, query.id).toHaveLength(0);
        continue;
      }
      expect(query.targets.length, query.id).toBeGreaterThan(0);
      const keys = query.targets.map((target) => `${target.slug}#${target.section}`);
      expect(new Set(keys).size, query.id).toBe(keys.length);
      for (const target of query.targets) {
        expect(
          () => sectionText(target.slug, target.section),
          `${query.id} ${target.slug}#${target.section}`,
        ).not.toThrow();
      }
    }
  });

  it("keeps same-language categories in the page language and cross-language queries in another language", () => {
    for (const query of queries) {
      const primary = query.targets[0];
      if (!primary) continue;
      const pageLanguage = pageBySlug.get(primary.slug)?.language;
      if (query.category === "cross-language") expect(query.language, query.id).not.toBe(pageLanguage);
      if (query.category === "lexical" || query.category === "paraphrase" || query.category === "typo")
        expect(query.language, query.id).toBe(pageLanguage);
    }
  });

  it("makes lexical queries share at least one content word with their target section", () => {
    for (const query of queries.filter((entry) => entry.category === "lexical")) {
      const target = query.targets[0];
      const sectionWords = contentWords(sectionText(target.slug, target.section));
      const shared = [...contentWords(query.query)].filter((word) => sectionWords.has(word));
      expect(shared.length, `${query.id} shares nothing with ${target.slug}#${target.section}`).toBeGreaterThan(0);
    }
  });

  it("makes paraphrase queries share no content word with any gold section or its page title", () => {
    const violations: string[] = [];
    for (const query of queries.filter((entry) => entry.category === "paraphrase")) {
      const queryWords = contentWords(query.query);
      for (const target of query.targets) {
        const sectionWords = contentWords(sectionText(target.slug, target.section));
        const shared = [...queryWords].filter((word) => sectionWords.has(word));
        if (shared.length > 0) violations.push(`${query.id} -> ${target.slug}#${target.section}: ${shared.join(", ")}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("gives every typo query at least one misspelled token that appears nowhere in the corpus", () => {
    for (const query of queries.filter((entry) => entry.category === "typo")) {
      const unknown = tokens(query.query).filter((token) => token.length >= 4 && !corpusVocabulary.has(token));
      expect(unknown.length, query.id).toBeGreaterThan(0);
    }
  });
});
