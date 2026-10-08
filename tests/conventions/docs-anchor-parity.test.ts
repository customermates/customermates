import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { slugifyHeading } from "@/core/utils/search-text";
import { CONTENT_LOCALES, DEFAULT_LOCALE } from "@/i18n/locale-registry";

import { REPO_ROOT } from "./walk";

/**
 * Agents cite docs sections by anchor, so anchors must be stable and the same in every language:
 * a translated page keeps its English page's H2/H3 anchors, in order, as explicit `[#anchor]`
 * suffixes. App links are checked by docs-app-links.test.ts.
 */
type Heading = { level: number; anchor: string; explicit: boolean; line: number };
type Page = { headings: Heading[] };

const EXPLICIT_ANCHOR = /\s*(?:\[#([^\]]+)\]|\{#([^}]+)\})\s*$/;

export function parseDocsPage(text: string): Page {
  const headings: Heading[] = [];
  let fence: string | null = null;
  text.split("\n").forEach((line, index) => {
    const marker = /^(```|~~~)/.exec(line)?.[1];
    if (marker) fence = fence === marker ? null : (fence ?? marker);
    if (fence) return;
    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading) {
      const explicit = EXPLICIT_ANCHOR.exec(heading[2]);
      const anchor = explicit ? (explicit[1] ?? explicit[2]) : slugifyHeading(heading[2].replace(EXPLICIT_ANCHOR, ""));
      headings.push({ level: heading[1].length, anchor, explicit: !!explicit, line: index + 1 });
    }
  });
  return { headings };
}

export function translationViolations(slug: string, locale: string, source: Page, translation: Page): string[] {
  const found: string[] = [];
  const expected = source.headings.map((heading) => `${heading.level}#${heading.anchor}`).join(" ");
  const actual = translation.headings.map((heading) => `${heading.level}#${heading.anchor}`).join(" ");
  if (expected !== actual) found.push(`${locale}/${slug}: H2/H3 anchors differ from ${DEFAULT_LOCALE}`);
  for (const heading of translation.headings.filter((entry) => !entry.explicit)) {
    found.push(`${locale}/${slug}:${heading.line}: heading needs an explicit [#${heading.anchor}]`);
  }
  return found;
}

function docsPages(locale: string): Map<string, Page> {
  const dir = join(REPO_ROOT, "content", "docs", locale);
  return new Map(
    readdirSync(dir)
      .filter((file) => file.endsWith(".mdx"))
      .map((file) => [
        file.replace(/\.mdx$/, ""),
        parseDocsPage(readFileSync(join(dir, file), "utf8").replace(/^---[\s\S]*?---\n/, "")),
      ]),
  );
}

describe("docs anchor parity", () => {
  it("flags a translated heading without an explicit anchor", () => {
    const source = parseDocsPage("## Roles tab\n### Who can edit roles?");
    const translation = parseDocsPage("## Tab Rollen [#roles-tab]\n### Wer darf Rollen bearbeiten?");
    expect(translationViolations("app-company", "de", source, translation)).toEqual([
      "de/app-company: H2/H3 anchors differ from en",
      "de/app-company:2: heading needs an explicit [#wer-darf-rollen-bearbeiten]",
    ]);
  });

  it("keeps every translated page's anchors equal to the English page", () => {
    const source = docsPages(DEFAULT_LOCALE);
    const violations = CONTENT_LOCALES.filter((locale) => locale !== DEFAULT_LOCALE).flatMap((locale) =>
      [...docsPages(locale)].flatMap(([slug, translation]) => {
        const english = source.get(slug);
        return english
          ? translationViolations(slug, locale, english, translation)
          : [`${locale}/${slug}: no English page`];
      }),
    );
    expect(violations).toEqual([]);
  });
});
